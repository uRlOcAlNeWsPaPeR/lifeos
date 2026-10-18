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
}

/** Sorted, non-overlapping, with touching same-colour neighbours joined. */
function tidy(list: Highlight[]): Highlight[] {
  const sorted = list.filter((h) => h.end > h.start).sort((a, b) => a.start - b.start);
  const out: Highlight[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && last.color === h.color && h.start <= last.end) last.end = Math.max(last.end, h.end);
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
    if (h.start < start) out.push({ start: h.start, end: start, color: h.color });
    if (h.end > end) out.push({ start: end, end: h.end, color: h.color });
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
