// Turning a list of memories into a web: who is connected to whom, and where
// each node sits. Pure and deterministic — the same memories always lay out the
// same way, so the web doesn't reshuffle between visits and can be tested.

import type { MemoryKind, MemoryNode } from "./types";
import { keywordsOf } from "./keywords";

export interface GraphNode {
  id: string;
  kind: MemoryKind;
  title: string;
  at: number | null;
  /** A course/subject the memories hang off, rather than a memory itself. */
  hub: boolean;
  /** Drawn size in CSS px at zoom 1. */
  radius: number;
  degree: number;
}

export interface GraphLink {
  /** Indices into `nodes`. */
  a: number;
  b: number;
  weight: number;
  /** Membership in a hub, as opposed to a shared topic. */
  hub: boolean;
}

export interface BrainGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  index: Map<string, number>;
  /** Memories left out because there were more than `maxNodes`. */
  truncated: number;
}

export interface GraphOptions {
  maxNodes?: number;
  /** Most topic links any one memory keeps — more turns the web into a hairball. */
  topicLinksPerNode?: number;
  /** A hub needs at least this many members to be worth drawing. */
  minHubMembers?: number;
}

const MAX_POSTING = 40;

export function buildGraph(memories: MemoryNode[], opts: GraphOptions = {}): BrainGraph {
  const maxNodes = opts.maxNodes ?? 420;
  const perNode = opts.topicLinksPerNode ?? 3;
  const minHub = opts.minHubMembers ?? 2;

  // Over the cap, keep the newest — the oldest are one time-filter away.
  const sorted = [...memories].filter((m) => m.kind !== "course").sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
  const kept = sorted.slice(0, maxNodes);
  const truncated = sorted.length - kept.length;

  const nodes: GraphNode[] = kept.map((m) => ({
    id: m.id,
    kind: m.kind,
    title: m.title,
    at: m.at,
    hub: false,
    radius: 4,
    degree: 0,
  }));
  const index = new Map<string, number>(nodes.map((n, i) => [n.id, i]));
  const links: GraphLink[] = [];

  // Hubs: a course or subject with enough memories to be a cluster centre.
  const members = new Map<string, { label: string; idx: number[] }>();
  kept.forEach((m, i) => {
    if (!m.hubKey) return;
    const h = members.get(m.hubKey) ?? { label: m.hubLabel ?? m.hubKey, idx: [] };
    h.idx.push(i);
    members.set(m.hubKey, h);
  });
  for (const [key, h] of [...members.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (h.idx.length < minHub) continue;
    const hubIdx = nodes.length;
    nodes.push({ id: `hub:${key}`, kind: "course", title: h.label, at: null, hub: true, radius: 13 + Math.min(10, Math.sqrt(h.idx.length) * 2.4), degree: 0 });
    index.set(`hub:${key}`, hubIdx);
    for (const i of h.idx) links.push({ a: i, b: hubIdx, weight: 1, hub: true });
  }

  // Topic links: memories that share meaningful words, strongest few each.
  const n = kept.length;
  const kw = kept.map((m) => keywordsOf(m.title, m.text, m.tags));
  const df = new Map<string, number>();
  for (const k of kw) for (const t of k.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  // A word in a fifth of everything says nothing about any two of them.
  const tooCommon = Math.max(8, Math.floor(n * 0.2));
  const postings = new Map<string, number[]>();
  kw.forEach((k, i) => {
    for (const t of k.keys()) {
      const d = df.get(t) ?? 0;
      if (d < 2 || d > tooCommon) continue;
      (postings.get(t) ?? postings.set(t, []).get(t)!).push(i);
    }
  });

  // One shared word is enough when the word is rare ("photosynthesis" in three
  // memories); a common word needs company to mean anything.
  const rareDf = Math.max(3, Math.floor(n * 0.06));
  const pair = new Map<number, { score: number; shared: number; strong: boolean }>();
  for (const [t, list] of postings) {
    const idf = Math.log(n / (df.get(t) ?? 1));
    const use = list.length > MAX_POSTING ? list.slice(0, MAX_POSTING) : list;
    for (let x = 0; x < use.length; x++) {
      for (let y = x + 1; y < use.length; y++) {
        const i = use[x];
        const j = use[y];
        const key = i * 100_000 + j;
        const wi = kw[i].get(t) ?? 1;
        const wj = kw[j].get(t) ?? 1;
        const cur = pair.get(key) ?? { score: 0, shared: 0, strong: false };
        cur.score += idf * Math.min(wi, wj);
        cur.shared += 1;
        if ((wi >= 4 && wj >= 4) || (df.get(t) ?? 99) <= rareDf) cur.strong = true; // both tagged it, or it's rare
        pair.set(key, cur);
      }
    }
  }

  const candidates: Map<number, { other: number; score: number }[]> = new Map();
  const add = (i: number, other: number, score: number) => {
    const list = candidates.get(i) ?? [];
    list.push({ other, score });
    candidates.set(i, list);
  };
  for (const [key, v] of pair) {
    if (v.shared < 2 && !v.strong) continue;
    const i = Math.floor(key / 100_000);
    const j = key % 100_000;
    add(i, j, v.score);
    add(j, i, v.score);
  }
  const chosen = new Set<number>();
  for (const [i, list] of candidates) {
    list.sort((a, b) => b.score - a.score || a.other - b.other);
    for (const c of list.slice(0, perNode)) chosen.add(Math.min(i, c.other) * 100_000 + Math.max(i, c.other));
  }
  const maxScore = Math.max(1, ...[...chosen].map((k) => pair.get(k)?.score ?? 0));
  for (const key of [...chosen].sort((a, b) => a - b)) {
    const v = pair.get(key)!;
    links.push({ a: Math.floor(key / 100_000), b: key % 100_000, weight: 0.3 + 0.7 * (v.score / maxScore), hub: false });
  }

  for (const l of links) {
    nodes[l.a].degree++;
    nodes[l.b].degree++;
  }
  for (const nd of nodes) if (!nd.hub) nd.radius = 5 + Math.min(6, Math.sqrt(nd.degree) * 1.6);

  return { nodes, links, index, truncated };
}

/* -------------------------------- layout --------------------------------- */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Force-directed layout (Fruchterman–Reingold). Returns x,y pairs normalised so
 * the farthest node sits at radius 1, centred on the origin. Linked memories
 * pull together, everything pushes apart, and each hub gathers its members into
 * a cluster — which is what makes it read as a web with neighbourhoods rather
 * than a ball of dots.
 */
export function layoutGraph(g: BrainGraph, opts: { iterations?: number; seed?: number } = {}): Float32Array {
  const n = g.nodes.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;
  if (n === 1) return out;

  const rand = rng(opts.seed ?? 7);
  const iterations = opts.iterations ?? (n > 300 ? 160 : 240);
  const x = new Float64Array(n);
  const y = new Float64Array(n);

  const hubs: number[] = [];
  g.nodes.forEach((nd, i) => nd.hub && hubs.push(i));
  const hubOf = new Int32Array(n).fill(-1);
  for (const l of g.links) if (l.hub) hubOf[l.a] = l.b;

  const R = Math.sqrt(n) * 1.2;
  hubs.forEach((h, k) => {
    const ang = (k / hubs.length) * Math.PI * 2;
    x[h] = Math.cos(ang) * R * 0.7;
    y[h] = Math.sin(ang) * R * 0.7;
  });
  for (let i = 0; i < n; i++) {
    if (g.nodes[i].hub) continue;
    const h = hubOf[i];
    const ang = rand() * Math.PI * 2;
    if (h >= 0) {
      const r = 0.4 + rand() * R * 0.25;
      x[i] = x[h] + Math.cos(ang) * r;
      y[i] = y[h] + Math.sin(ang) * r;
    } else {
      const r = Math.sqrt(rand()) * R;
      x[i] = Math.cos(ang) * r;
      y[i] = Math.sin(ang) * r;
    }
  }

  const k = Math.sqrt((R * R * 4) / n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temp = R * 0.35;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = x[i] - x[j];
        let vy = y[i] - y[j];
        let d2 = vx * vx + vy * vy;
        if (d2 < 1e-6) {
          // Exactly stacked: nudge apart deterministically instead of dividing by ~0.
          vx = (rand() - 0.5) * 0.01;
          vy = (rand() - 0.5) * 0.01;
          d2 = vx * vx + vy * vy + 1e-6;
        }
        // Past the usual push, nodes that are crowding each other shove apart
        // harder — what keeps a busy cluster from collapsing into one blob.
        const f = (k * k) / d2 + (d2 < k * k * 2.2 ? (k * k * 2.2 - d2) / (k * k) * 1.4 / Math.sqrt(d2) : 0);
        dx[i] += vx * f;
        dy[i] += vy * f;
        dx[j] -= vx * f;
        dy[j] -= vy * f;
      }
    }

    for (const l of g.links) {
      const vx = x[l.a] - x[l.b];
      const vy = y[l.a] - y[l.b];
      const d = Math.sqrt(vx * vx + vy * vy) || 1e-3;
      // A spring with a rest length: members sit a little way out from their
      // hub (so the spokes are visible) and topic links hold their ends close
      // but not touching.
      const rest = l.hub ? k * 1.7 : k * 0.9;
      const pull = ((d - rest) / k) * (l.hub ? 0.9 : 0.3 + 0.6 * l.weight);
      dx[l.a] -= vx * pull;
      dy[l.a] -= vy * pull;
      dx[l.b] += vx * pull;
      dy[l.b] += vy * pull;
    }

    for (let i = 0; i < n; i++) {
      // A light pull to the middle keeps unlinked islands from drifting off.
      dx[i] -= x[i] * 0.09;
      dy[i] -= y[i] * 0.09;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1e-9;
      const step = Math.min(len, temp);
      x[i] += (dx[i] / len) * step;
      y[i] += (dy[i] / len) * step;
    }
    temp -= cool;
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += x[i];
    cy += y[i];
  }
  cx /= n;
  cy /= n;
  let max = 1e-9;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.hypot(x[i] - cx, y[i] - cy));
  for (let i = 0; i < n; i++) {
    out[i * 2] = (x[i] - cx) / max;
    out[i * 2 + 1] = (y[i] - cy) / max;
  }
  return out;
}

/** Memories directly linked to `id`, strongest first. */
export function neighboursOf(g: BrainGraph, id: string): { id: string; weight: number; hub: boolean }[] {
  const i = g.index.get(id);
  if (i == null) return [];
  const out: { id: string; weight: number; hub: boolean }[] = [];
  for (const l of g.links) {
    if (l.a === i) out.push({ id: g.nodes[l.b].id, weight: l.weight, hub: l.hub });
    else if (l.b === i) out.push({ id: g.nodes[l.a].id, weight: l.weight, hub: l.hub });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
