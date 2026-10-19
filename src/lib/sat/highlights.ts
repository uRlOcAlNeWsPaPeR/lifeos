// Highlighting a passage, the way the real test lets you.
//
// A highlight is a span of the passage's *text*, counted in characters from the
// start (markup doesn't count), plus a colour. Keeping them as plain offsets —
// not DOM ranges — is what lets them survive the passage being re-rendered,
// and lets them be saved per question and put back when a student returns to
// one. Everything here is pure; the DOM side lives in components/sat/highlight.tsx.

export type HighlightColor = "yellow" | "blue" | "pink";

export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "blue", "pink"];

export interface Highlight {
  start: number;
  /** Exclusive. */
  end: number;
  color: HighlightColor;
  /** An optional note pinned to the highlighted words. */
  note?: string;
}

/** Sorted, non-overlapping, with touching same-colour neighbours joined. */
function tidy(list: Highlight[]): Highlight[] {
  const sorted = list.filter((h) => h.end > h.start).sort((a, b) => a.start - b.start);
  const out: Highlight[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    // A highlight carrying a note keeps its own span — joining would swallow the note.
    const plain = last && last.note === undefined && h.note === undefined;
    if (last && plain && last.color === h.color && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else out.push({ ...h });
  }
  return out;
}

/** Take [start, end) out of every highlight, splitting any that straddle it. */
export function removeRange(list: Highlight[], start: number, end: number): Highlight[] {
  if (end <= start) return list;
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= start || h.start >= end) {
      out.push({ ...h });
      continue;
    }
    // The note stays with the first piece that survives.
    let note = h.note;
    if (h.start < start) {
      out.push({ start: h.start, end: start, color: h.color, ...(note !== undefined ? { note } : {}) });
      note = undefined;
    }
    if (h.end > end) out.push({ start: end, end: h.end, color: h.color, ...(note !== undefined ? { note } : {}) });
  }
  return tidy(out);
}

/**
 * Highlight [start, end) in a colour. Whatever was highlighted there before is
 * replaced, so selecting across a yellow patch and choosing blue turns it blue
 * rather than stacking two colours on the same words.
 */
export function addHighlight(list: Highlight[], h: Highlight): Highlight[] {
  if (h.end <= h.start) return list;
  return tidy([...removeRange(list, h.start, h.end), h]);
}

/** Whether any highlight touches [start, end). */
export function overlaps(list: Highlight[], start: number, end: number): boolean {
  return list.some((h) => h.start < end && h.end > start);
}

/** The highlight covering a character offset, if any. */
export function highlightAt(list: Highlight[], offset: number): Highlight | null {
  return list.find((h) => offset >= h.start && offset < h.end) ?? null;
}

/** Set (or, with blank text, clear) the note on the highlight covering [start, end). */
export function setNote(list: Highlight[], start: number, end: number, note: string): Highlight[] {
  const text = note.trim();
  return list.map((h) => {
    if (h.start > start || h.end < end) return h;
    const { note: _old, ...rest } = h;
    void _old;
    return text ? { ...rest, note: text } : rest;
  });
}

const EMPTY: Highlight[] = [];

/** A saved highlight, as it sits in an exam's saved state (see ExamAnnotation). */
export interface StoredAnnotation {
  c: "s" | "t";
  start: number;
  end: number;
  note: string;
  color?: HighlightColor;
}

/**
 * The highlights for one part of a question (`s` the passage, `t` the question
 * text) out of what a saved exam holds. A saved exam, or a backup restored
 * from ScoreClimb, is only as trustworthy as whatever wrote it, so malformed
 * entries are dropped rather than allowed to break painting; one with no
 * colour (ScoreClimb's) is yellow.
 */
export function annotsFor(stored: unknown, part: "s" | "t"): Highlight[] {
  if (!Array.isArray(stored)) return EMPTY;
  const out: Highlight[] = [];
  for (const a of stored) {
    if (!a || typeof a !== "object") continue;
    const x = a as Record<string, unknown>;
    if (x.c !== part) continue;
    const { start, end } = x;
    if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number)) continue;
    const color = (HIGHLIGHT_COLORS as string[]).includes(x.color as string) ? (x.color as HighlightColor) : "yellow";
    const note = typeof x.note === "string" && x.note.trim() ? x.note : undefined;
    out.push({ start: start as number, end: end as number, color, ...(note !== undefined ? { note } : {}) });
  }
  return out.length ? out : EMPTY;
}

/**
 * The saved list with one part's highlights replaced by `next`, leaving the
 * other part (and anything that isn't ours to read) exactly as it was.
 */
export function withAnnots(stored: unknown, part: "s" | "t", next: Highlight[]): StoredAnnotation[] {
  const keep = Array.isArray(stored) ? (stored as StoredAnnotation[]).filter((a) => a && a.c !== part) : [];
  return [
    ...keep,
    ...next.map((h) => ({ c: part, start: h.start, end: h.end, note: h.note ?? "", color: h.color })),
  ];
}
