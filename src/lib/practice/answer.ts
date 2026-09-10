// Answer checking for the type-in games.
//
// The bar: a student who knows the answer should never be marked wrong for a
// typo, a missing "the", or British spelling — and a student who doesn't know it
// should never be marked right. Everything here is pure and unit-testable.

/**
 * Strip a typed answer down to what actually carries meaning: lowercase, no
 * accents, no punctuation, no leading article, single spaces.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

/** Levenshtein distance, capped — we only ever care about "within k edits". */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1; // whole row already past the cap
    prev = row;
  }
  return prev[b.length];
}

/**
 * How many typos to forgive at a given answer length. Short answers get no
 * slack — at three letters, one edit is a different word ("cat" vs "cot").
 */
function tolerance(len: number): number {
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  if (len <= 15) return 2;
  return 3;
}

export type Verdict = "correct" | "close" | "wrong";

/**
 * Grade a typed answer against the card's back.
 *
 * "close" is its own verdict rather than a pass: the game shows the student what
 * they nearly wrote and lets them decide, which teaches more than a silent
 * accept and avoids marking a genuinely wrong answer right.
 *
 * A card whose back lists alternatives separated by "/" or "," (e.g.
 * "mitochondrion / mitochondria") accepts any one of them.
 */
export function checkAnswer(typed: string, expected: string): Verdict {
  const got = normalize(typed);
  if (!got) return "wrong";

  const options = expected
    .split(/[/,;]|\bor\b/gi)
    .map(normalize)
    .filter(Boolean);
  // Always allow the untouched whole string too — the separators above may well
  // be part of the answer rather than a list ("Rock, Paper, Scissors").
  const whole = normalize(expected);
  if (whole && !options.includes(whole)) options.push(whole);

  let best: Verdict = "wrong";
  for (const want of options) {
    if (got === want) return "correct";

    const dist = editDistance(got, want, tolerance(want.length) + 1);
    if (dist <= tolerance(want.length)) return "correct";
    if (dist <= tolerance(want.length) + 1) best = "close";

    // A long definition is recalled, not transcribed. Accept it when the
    // student produced the words that matter — but only when the expected
    // answer is long enough for "most of the keywords" to mean something.
    if (want.split(" ").length >= 4 && keywordOverlap(got, want) >= 0.7) return "correct";
  }
  return best;
}

const STOPWORDS = new Set(
  "of to in is are was were be been being and or a an the that which it its as for on at by with from this these those into than then so such".split(" "),
);

/** Share of the expected answer's content words that appear in the response. */
function keywordOverlap(got: string, want: string): number {
  const keywords = want.split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!keywords.length) return 0;
  const typed = new Set(got.split(" "));
  const hits = keywords.filter(
    (k) => typed.has(k) || [...typed].some((t) => editDistance(t, k, 1) <= 1),
  );
  return hits.length / keywords.length;
}
