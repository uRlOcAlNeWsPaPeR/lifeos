// Ways back into the past: the timeline, and a daily nudge about something old.

import type { MemoryNode } from "./types";
import { DAY_MS, monthName } from "./time";

export interface MonthGroup {
  key: string;
  label: string;
  nodes: MemoryNode[];
}
export interface YearGroup {
  year: number | null;
  label: string;
  months: MonthGroup[];
  count: number;
}

/** Newest year first, newest month first, newest memory first; undated last. */
export function groupTimeline(nodes: MemoryNode[]): YearGroup[] {
  const dated = nodes.filter((n) => n.at != null && n.kind !== "course").sort((a, b) => (b.at as number) - (a.at as number));
  const undated = nodes.filter((n) => n.at == null && n.kind !== "course");

  const years = new Map<number, Map<number, MemoryNode[]>>();
  for (const n of dated) {
    const d = new Date(n.at as number);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(n);
  }

  const out: YearGroup[] = [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      const groups = [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([m, list]) => ({ key: `${year}-${m}`, label: monthName(m), nodes: list }));
      return { year, label: String(year), months: groups, count: groups.reduce((n, g) => n + g.nodes.length, 0) };
    });

  if (undated.length) {
    out.push({
      year: null,
      label: "Undated",
      months: [{ key: "undated", label: "Undated", nodes: undated }],
      count: undated.length,
    });
  }
  return out;
}

/** A small stable hash, so the same day always surfaces the same memories. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Memories worth revisiting: older than three weeks (anything fresher is
 * already on the student's mind), varied in kind, and the same set all day so
 * it doesn't reshuffle on every visit. If nothing is that old yet, the oldest
 * few are offered instead — better a gentle nudge than an empty card.
 */
export function resurface(nodes: MemoryNode[], now: number, count = 3): MemoryNode[] {
  const pool = nodes.filter((n) => n.kind !== "course" && n.at != null && n.text.trim().length + n.title.length > 12);
  if (!pool.length) return [];
  let old = pool.filter((n) => now - (n.at as number) > 21 * DAY_MS);
  if (!old.length) old = [...pool].sort((a, b) => (a.at as number) - (b.at as number)).slice(0, count);

  const today = new Date(now);
  const seed = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const ranked = [...old].sort((a, b) => hash(seed + a.id) - hash(seed + b.id));

  const picked: MemoryNode[] = [];
  const kinds = new Set<string>();
  for (const n of ranked) {
    if (picked.length >= count) break;
    if (kinds.has(n.kind) && ranked.length > count * 2) continue;
    kinds.add(n.kind);
    picked.push(n);
  }
  for (const n of ranked) {
    if (picked.length >= count) break;
    if (!picked.includes(n)) picked.push(n);
  }
  return picked.sort((a, b) => (a.at as number) - (b.at as number));
}
