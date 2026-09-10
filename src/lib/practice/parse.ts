// Turning text a student already has into cards.
//
// Two entry points:
//   parsePaste()      — a study list they typed or copied out of a doc
//   cardsFromNotes()  — the offline fallback for "make cards from my notes",
//                       used when no LLM key is configured
//
// Both are pure so the Practice UI can preview the result before saving.

const MAX_CARDS = 300;

export interface ParsedCard {
  front: string;
  back: string;
}

/**
 * Split a pasted block into term/definition pairs.
 *
 * Handles the shapes students actually paste — Quizlet exports (tab-separated),
 * a dash or colon list, "Q:/A:" blocks, and numbered lists — by picking ONE
 * separator for the whole block rather than guessing per line, so a definition
 * containing a dash doesn't get sliced in half.
 */
export function parsePaste(raw: string): ParsedCard[] {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const qa = parseQaBlocks(text);
  if (qa.length) return qa.slice(0, MAX_CARDS);

  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim()) // list bullets / numbering
    .filter(Boolean);
  if (!lines.length) return [];

  const sep = pickSeparator(lines);
  if (!sep) return [];

  const out: ParsedCard[] = [];
  for (const line of lines) {
    const at = line.search(sep);
    if (at <= 0) continue;
    const front = line.slice(0, at).trim();
    const back = line.slice(at).replace(sep, "").trim();
    if (front && back) out.push({ front, back });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

/**
 * Candidate separators, strongest signal first. Tab wins outright when present
 * (that's a spreadsheet or Quizlet export); the others have to appear on most
 * lines before they're trusted.
 */
const SEPARATORS: RegExp[] = [
  /\t+/,
  /\s+[–—]\s+/, // en/em dash, always spaced
  /\s+-\s+/, // hyphen, only when spaced — "T-cell" must survive
  /\s*:\s+/,
  /\s*\|\s*/,
  /\s+=\s+/,
];

/** The one separator that splits most of the lines. */
function pickSeparator(lines: string[]): RegExp | null {
  let best: { sep: RegExp; hits: number } | null = null;
  for (const sep of SEPARATORS) {
    const hits = lines.filter((l) => l.search(sep) > 0).length;
    if (hits / lines.length >= 0.6 && (!best || hits > best.hits)) best = { sep, hits };
  }
  return best?.sep ?? null;
}

/** "Q: ... / A: ..." pairs, which may each run over several lines. */
function parseQaBlocks(text: string): ParsedCard[] {
  if (!/^\s*q[:.)]/im.test(text)) return [];
  const out: ParsedCard[] = [];
  // Split on every Q marker, then split each chunk on its A marker.
  for (const chunk of text.split(/^\s*q[:.)]\s*/gim).slice(1)) {
    const m = chunk.split(/^\s*a[:.)]\s*/im);
    if (m.length < 2) continue;
    const front = m[0].trim();
    const back = m.slice(1).join(" ").trim();
    if (front && back) out.push({ front, back });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Offline note → card extraction
 *
 * The LLM does this far better, but LifeOS works with no API key, so
 * Practice has to produce something useful from prose on its own. The
 * rule: only lift sentences that are already shaped like a definition,
 * and never invent an answer.
 * ------------------------------------------------------------------ */

/** "X is Y" / "X refers to Y" / "X means Y" — the sentence shapes worth lifting. */
const DEFINITION = /^(.{2,60}?)\s+(?:is|are|was|were|refers to|means|is called|is known as|describes)\s+(?:the\s+|a\s+|an\s+)?(.{8,240})$/i;

export function cardsFromNotes(notes: string): ParsedCard[] {
  // An explicit list beats prose extraction whenever the text has one.
  const listed = parsePaste(notes);
  if (listed.length >= 3) return listed;

  const out: ParsedCard[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(notes)) {
    const m = DEFINITION.exec(sentence);
    if (!m) continue;

    const front = m[1].replace(/^(?:the|a|an)\s+/i, "").trim();
    const back = m[2].trim().replace(/[.;,]$/, "");

    // A term should be a noun phrase, not a clause; a definition should say
    // something. Both sides also have to be free of dangling references
    // ("this", "it") that mean nothing once the sentence is out of context.
    if (front.split(/\s+/).length > 6) continue;
    if (/^(this|that|it|they|there|he|she|which|who)\b/i.test(front)) continue;
    if (back.split(/\s+/).length < 2) continue;

    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ front, back });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

/** Drop blanks, trim, and fold cards that repeat the same front. */
export function dedupeCards(cards: ParsedCard[]): ParsedCard[] {
  const seen = new Set<string>();
  const out: ParsedCard[] = [];
  for (const c of cards) {
    const front = c.front.trim();
    const back = c.back.trim();
    if (!front || !back) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front: front.slice(0, 300), back: back.slice(0, 1000) });
  }
  return out.slice(0, MAX_CARDS);
}
