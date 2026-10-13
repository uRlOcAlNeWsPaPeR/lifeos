// Cheap topic extraction — no model call, so the Brain costs nothing to build
// and works offline. Two memories are "about the same thing" when they share
// meaningful words after stop-words and plurals/endings are stripped.

const STOP = new Set(
  (
    "the and for that this with from have has had are was were will would could should about into over under " +
    "your you our out not but can its it's they them then than there their what when where which while who whom " +
    "how why just also very more most some any all each other such only own same too does did done doing been being " +
    "get got make made like need want use used using want task tasks assignment assignments note notes study " +
    "work today tomorrow due week day days time one two three first next last new add added please help"
  ).split(/\s+/),
);

export const isStop = (w: string) => STOP.has(w);

/** Strip the endings that make "multiplication"/"multiplying"/"multiplied" differ. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ion")) w = w.slice(0, -3);
  return w;
}

/**
 * Stemming alone leaves "multiplication" and "multiplying" apart
 * ("multiplicat" / "multiply"), so long words are also cut to a shared
 * prefix. Seven letters keeps "multipl" together while "internet" and
 * "international" stay different.
 */
export const ROOT_LEN = 7;
export function root(word: string): string {
  const s = stem(word);
  return s.length > ROOT_LEN ? s.slice(0, ROOT_LEN) : s;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || /^\d+$/.test(raw) || STOP.has(raw)) continue;
    const r = root(raw);
    if (r.length >= 3 && !STOP.has(r)) out.push(r);
  }
  return out;
}

/** The words that best describe a memory: title words count double. */
export function keywordsOf(title: string, text: string, tags: string[] = [], limit = 14): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (t: string, by: number) => counts.set(t, (counts.get(t) ?? 0) + by);
  for (const t of tokenize(title)) bump(t, 2);
  for (const t of tokenize(text)) bump(t, 1);
  // A tag the student typed is the strongest signal there is.
  for (const tag of tags) for (const t of tokenize(tag)) bump(t, 4);
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit));
}
