// Highlights & Notes on a passage, the way the real test's tool works: on any
// span of text you can set a highlight colour, add an underline, attach a note,
// or delete it all (College Board's own wording for the tool).
//
// A mark is a span of the passage's *text*, counted in characters from the
// start (markup doesn't count), with its style. Keeping them as plain offsets
// — not DOM ranges — is what lets them survive the passage being re-rendered,
// and lets them be saved per question and put back when a student returns to
// one. Everything here is pure; the DOM side lives in components/sat/highlight.tsx.

export type HighlightColor = "yellow" | "blue" | "pink";

export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "blue", "pink"];

export interface Highlight {
  start: number;
  /** Exclusive. */
  end: number;
  /** Highlight colour. Absent for an underline on its own. */
  color?: HighlightColor;
  /** Underlined — on its own, or on top of a highlight. */
  underline?: boolean;
  /** An optional note pinned to these words. */
  note?: string;
}

const sameStyle = (a: Highlight, b: Highlight) => a.color === b.color && Boolean(a.underline) === Boolean(b.underline);

/** A mark with no empty fields — `underline: undefined` and no underline are the same thing. */
function lean(h: Highlight): Highlight {
  const out: Highlight = { start: h.start, end: h.end };
  if (h.color) out.color = h.color;
  if (h.underline) out.underline = true;
  if (h.note !== undefined) out.note = h.note;
  return out;
}

/** Sorted, non-overlapping, with touching same-style neighbours joined. */
function tidy(list: Highlight[]): Highlight[] {
  const sorted = list.filter((h) => h.end > h.start).sort((a, b) => a.start - b.start);
  const out: Highlight[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    // A mark carrying a note keeps its own span — joining would swallow the note.
    const plain = last && last.note === undefined && h.note === undefined;
    if (last && plain && sameStyle(last, h) && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else out.push(lean(h));
  }
  return out;
}

/** The pieces of `h` that fall outside [start, end). */
function outsidePieces(h: Highlight, start: number, end: number): Highlight[] {
  const out: Highlight[] = [];
  const { note: _n, ...style } = h;
  void _n;
  if (h.start < start) out.push({ ...style, start: h.start, end: Math.min(h.end, start) });
  if (h.end > end) out.push({ ...style, start: Math.max(h.start, end), end: h.end });
  return out;
}

/** Take [start, end) out of every mark, splitting any that straddle it. */
export function removeRange(list: Highlight[], start: number, end: number): Highlight[] {
  if (end <= start) return list;
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= start || h.start >= end) {
      out.push({ ...h });
      continue;
    }
    // The note stays with the first piece that survives.
    const pieces = outsidePieces(h, start, end);
    if (pieces.length && h.note !== undefined) pieces[0].note = h.note;
    out.push(...pieces);
  }
  return tidy(out);
}

/**
 * Restyle [start, end): each stretch of it is handed to `fn` along with the
 * mark already on it (or null), and whatever comes back becomes that stretch's
 * style (null = no mark). Marks only partly inside are split, so a bit of a
 * long highlight can change colour without touching the rest. A note stays
 * with the first piece of the mark it was on.
 */
function restyle(
  list: Highlight[],
  start: number,
  end: number,
  fn: (cur: Highlight | null) => { color?: HighlightColor; underline?: boolean } | null,
): Highlight[] {
  if (end <= start) return list;
  const cuts = new Set<number>([start, end]);
  for (const h of list) {
    if (h.start > start && h.start < end) cuts.add(h.start);
    if (h.end > start && h.end < end) cuts.add(h.end);
  }
  const pts = [...cuts].sort((a, b) => a - b);

  const pieces: { h: Highlight; origin: number }[] = [];
  list.forEach((h, origin) => {
    if (h.end <= start || h.start >= end) pieces.push({ h: { ...h, note: undefined }, origin });
    else for (const p of outsidePieces(h, start, end)) pieces.push({ h: p, origin });
  });
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const origin = list.findIndex((h) => h.start <= a && h.end >= b);
    const style = fn(origin >= 0 ? list[origin] : null);
    if (style) pieces.push({ h: { start: a, end: b, ...style }, origin });
  }

  // Each note goes to the earliest surviving piece of the mark that had it.
  pieces.sort((x, y) => x.h.start - y.h.start);
  const out: Highlight[] = [];
  const noted = new Set<number>();
  for (const { h, origin } of pieces) {
    const note = origin >= 0 ? list[origin].note : undefined;
    const piece: Highlight = { ...h };
    delete piece.note;
    if (note !== undefined && !noted.has(origin)) {
      piece.note = note;
      noted.add(origin);
    }
    out.push(piece);
  }
  return tidy(out);
}

/**
 * Highlight [start, end) in a colour. Whatever colour was there before is
 * replaced, so selecting across a yellow patch and choosing blue turns it blue
 * rather than stacking two colours on the same words; an underline already
 * there stays.
 */
export function addHighlight(list: Highlight[], h: Highlight): Highlight[] {
  if (h.end <= h.start) return list;
  if (h.note !== undefined) {
    // A note pins itself to exactly these words, so it gets its own mark rather
    // than being merged into a same-coloured neighbour (which would swallow it).
    const underline = h.underline || isUnderlined(list, h.start, h.end);
    return tidy([...removeRange(list, h.start, h.end), { ...h, ...(underline ? { underline: true } : {}) }]);
  }
  return restyle(list, h.start, h.end, (cur) => ({ color: h.color, underline: cur?.underline || h.underline }));
}

/** Set a colour on [start, end), keeping any underline and note. */
export function setColor(list: Highlight[], start: number, end: number, color: HighlightColor): Highlight[] {
  return restyle(list, start, end, (cur) => ({ color, underline: cur?.underline }));
}

/**
 * Underline [start, end) (or take the underline off), keeping any colour and
 * note. Taking it off leaves a plain highlight, or nothing if there wasn't one.
 */
export function setUnderline(list: Highlight[], start: number, end: number, on: boolean): Highlight[] {
  return restyle(list, start, end, (cur) => {
    const color = cur?.color;
    if (!on && !color) return null;
    return { color, underline: on || undefined };
  });
}

/** Whether every character of [start, end) is underlined. */
export function isUnderlined(list: Highlight[], start: number, end: number): boolean {
  if (end <= start) return false;
  let pos = start;
  for (const h of [...list].sort((a, b) => a.start - b.start)) {
    if (h.end <= pos) continue;
    if (h.start > pos || !h.underline) return false;
    pos = h.end;
    if (pos >= end) return true;
  }
  return pos >= end;
}

/** The one colour covering all of [start, end), or null if it's mixed or uncoloured. */
export function colorOf(list: Highlight[], start: number, end: number): HighlightColor | null {
  if (end <= start) return null;
  let pos = start;
  let color: HighlightColor | undefined;
  for (const h of [...list].sort((a, b) => a.start - b.start)) {
    if (h.end <= pos) continue;
    if (h.start > pos || !h.color || (color && h.color !== color)) return null;
    color = h.color;
    pos = h.end;
    if (pos >= end) return color;
  }
  return pos >= end && color ? color : null;
}

/** Whether any mark touches [start, end). */
export function overlaps(list: Highlight[], start: number, end: number): boolean {
  return list.some((h) => h.start < end && h.end > start);
}

/** The mark covering a character offset, if any. */
export function highlightAt(list: Highlight[], offset: number): Highlight | null {
  return list.find((h) => offset >= h.start && offset < h.end) ?? null;
}

/** Set (or, with blank text, clear) the note on the mark covering [start, end). */
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
  /** "none" is an underline with no highlight; absent (ScoreClimb's) reads as yellow. */
  color?: HighlightColor | "none";
  underline?: boolean;
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
    const underline = x.underline === true;
    // "none" only means something on an underline; ScoreClimb's colourless highlights are yellow.
    const color: HighlightColor | undefined = (HIGHLIGHT_COLORS as string[]).includes(x.color as string)
      ? (x.color as HighlightColor)
      : x.color === "none" && underline
        ? undefined
        : "yellow";
    const note = typeof x.note === "string" && x.note.trim() ? x.note : undefined;
    out.push({
      start: start as number,
      end: end as number,
      ...(color ? { color } : {}),
      ...(underline ? { underline: true } : {}),
      ...(note !== undefined ? { note } : {}),
    });
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
    ...next.map((h) => ({
      c: part,
      start: h.start,
      end: h.end,
      note: h.note ?? "",
      color: h.color ?? ("none" as const),
      ...(h.underline ? { underline: true } : {}),
    })),
  ];
}
