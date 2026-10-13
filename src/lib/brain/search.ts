// Recall: find a memory by what it was about, and optionally *when* — the
// student who types "multiplication 10 years ago" gets the memories from around
// then that mention multiplication, not every multiplication ever.

import type { MemoryNode } from "./types";
import { parseTimeHint, type TimeRange } from "./time";
import { isStop, root, tokenize } from "./keywords";

export interface RecallResult {
  /** id → relevance (higher is better). Null means "no query": everything matches. */
  scores: Map<string, number> | null;
  range: TimeRange | null;
  /** The words searched for after any time phrase was lifted out. */
  words: string;
}

interface Prepared {
  title: string;
  text: string;
  tags: string;
  hub: string;
  roots: Set<string>;
}
const prepared = new WeakMap<MemoryNode, Prepared>();
function prepare(n: MemoryNode): Prepared {
  let p = prepared.get(n);
  if (!p) {
    p = {
      title: n.title.toLowerCase(),
      text: n.text.toLowerCase(),
      tags: n.tags.join(" ").toLowerCase(),
      hub: (n.hubLabel ?? "").toLowerCase(),
      roots: new Set(tokenize(`${n.title} ${n.text} ${n.tags.join(" ")} ${n.hubLabel ?? ""}`)),
    };
    prepared.set(n, p);
  }
  return p;
}

/**
 * Each searched word must be somewhere in the memory — as typed (so a half-
 * typed "multip" already matches) or as the same root ("multiplying" finds
 * "multiplication"). Title hits beat tag hits beat text hits.
 */
function scoreNode(n: MemoryNode, words: string[], phrase: string): number {
  const p = prepare(n);
  let score = 0;
  for (const w of words) {
    const r = root(w);
    let hit = 0;
    if (p.title.includes(w) || (r.length >= 3 && p.title.split(/[^a-z0-9]+/).some((t) => root(t) === r))) hit = 5;
    else if (p.tags.includes(w)) hit = 4;
    else if (p.hub.includes(w)) hit = 3;
    else if (p.text.includes(w) || p.roots.has(r)) hit = 1;
    if (!hit) return 0; // every word must be somewhere
    score += hit;
  }
  if (phrase && words.length > 1 && (p.title.includes(phrase) || p.text.includes(phrase))) score += 3;
  return score;
}

export function recall(nodes: MemoryNode[], query: string, now: number): RecallResult {
  const { range, rest } = parseTimeHint(query, now);
  const words = rest.trim();
  // Stop-words ("the", "what") are dropped so a natural question still works.
  const terms = [...new Set(words.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !isStop(w)))];

  if (!range && terms.length === 0) return { scores: null, range: null, words };

  const scores = new Map<string, number>();
  const phrase = words.toLowerCase();
  for (const n of nodes) {
    if (n.kind === "course") continue;
    if (range && (n.at == null || n.at < range.start || n.at >= range.end)) continue;
    if (terms.length === 0) {
      scores.set(n.id, 1);
      continue;
    }
    const s = scoreNode(n, terms, phrase);
    if (s > 0) scores.set(n.id, s);
  }
  return { scores, range, words };
}
