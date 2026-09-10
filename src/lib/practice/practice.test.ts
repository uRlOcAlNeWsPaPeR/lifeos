/**
 * Practice logic checks. Pure functions only — no DOM, no Firestore.
 *
 *   npx tsx src/lib/practice/practice.test.ts
 *
 * Written against node's assert so it runs with no test-runner dependency;
 * `npm test` wires it up.
 */
import assert from "node:assert/strict";
import { checkAnswer, normalize } from "./answer";
import { parsePaste, cardsFromNotes, dedupeCards } from "./parse";
import { buildQueue, deckMastery, hydrateCard, intervalDays, mastery, newCard, review } from "./srs";
import type { CardDTO } from "@/lib/types";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${(e as Error).message.split("\n")[0]}`);
  }
}

const card = (over: Partial<CardDTO> = {}): CardDTO =>
  hydrateCard({ id: "c1", ...newCard("front", "back"), ...over });

/* ------------------------------- answers ------------------------------- */

test("normalize strips case, punctuation, accents and a leading article", () => {
  assert.equal(normalize("  The Café, really! "), "cafe really");
});

test("exact and near-miss answers are accepted", () => {
  assert.equal(checkAnswer("mitochondria", "mitochondria"), "correct");
  assert.equal(checkAnswer("mitochondira", "mitochondria"), "correct"); // transposition
  assert.equal(checkAnswer("  Photosynthesis. ", "photosynthesis"), "correct");
});

test("short answers get no typo slack", () => {
  // One edit apart, but at three letters that is a different word.
  assert.notEqual(checkAnswer("cot", "cat"), "correct");
});

test("a genuinely wrong answer is never correct", () => {
  assert.equal(checkAnswer("the powerhouse of the cell", "ribosome"), "wrong");
  assert.equal(checkAnswer("1815", "1776"), "wrong");
});

test("a card listing alternatives accepts any one of them", () => {
  assert.equal(checkAnswer("mitochondrion", "mitochondrion / mitochondria"), "correct");
  assert.equal(checkAnswer("mitochondria", "mitochondrion / mitochondria"), "correct");
});

test("a comma inside a single answer does not split it", () => {
  assert.equal(checkAnswer("Rock, Paper, Scissors", "Rock, Paper, Scissors"), "correct");
});

test("a long definition passes on keywords, not transcription", () => {
  const want = "the process by which plants convert sunlight into chemical energy";
  assert.equal(checkAnswer("process where plants convert sunlight into chemical energy", want), "correct");
  assert.equal(checkAnswer("something to do with plants", want), "wrong");
});

test("a near-miss is flagged close rather than silently accepted", () => {
  // Two typos in a 12-letter word are forgiven outright; three land in the
  // "close" band, where the game shows the answer instead of quietly passing.
  assert.equal(checkAnswer("mitochendrua", "mitochondria"), "correct");
  assert.equal(checkAnswer("mitochendruo", "mitochondria"), "close");
});

/* -------------------------------- paste -------------------------------- */

test("tab-separated pairs parse", () => {
  const out = parsePaste("cell\tbasic unit of life\natom\tsmallest unit of matter");
  assert.deepEqual(out, [
    { front: "cell", back: "basic unit of life" },
    { front: "atom", back: "smallest unit of matter" },
  ]);
});

test("a spaced dash list parses and T-cell survives", () => {
  const out = parsePaste("T-cell - a white blood cell\nB-cell - makes antibodies");
  assert.equal(out.length, 2);
  assert.equal(out[0].front, "T-cell");
  assert.equal(out[0].back, "a white blood cell");
});

test("numbered and bulleted lists lose their markers", () => {
  const out = parsePaste("1. osmosis: water moving across a membrane\n2. diffusion: particles spreading out");
  assert.equal(out.length, 2);
  assert.equal(out[0].front, "osmosis");
});

test("Q/A blocks parse across multiple lines", () => {
  const out = parsePaste("Q: What year did WW2 end?\nA: 1945\n\nQ: Who wrote Hamlet?\nA: Shakespeare");
  assert.deepEqual(out, [
    { front: "What year did WW2 end?", back: "1945" },
    { front: "Who wrote Hamlet?", back: "Shakespeare" },
  ]);
});

test("prose with no separator yields nothing rather than junk", () => {
  assert.deepEqual(parsePaste("just some rambling text with no structure at all here"), []);
});

test("dedupe folds repeated fronts and drops half-empty rows", () => {
  const out = dedupeCards([
    { front: "cell", back: "unit of life" },
    { front: "Cell", back: "duplicate" },
    { front: "", back: "orphan" },
    { front: "atom", back: "" },
  ]);
  assert.deepEqual(out, [{ front: "cell", back: "unit of life" }]);
});

/* ---------------------------- notes → cards ---------------------------- */

test("definition sentences become cards", () => {
  const out = cardsFromNotes(
    "Photosynthesis is the process plants use to make food. " +
      "Osmosis refers to water moving across a semipermeable membrane. " +
      "It was a really long lab and I was tired.",
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].front, "Photosynthesis");
});

test("sentences starting with a pronoun are skipped", () => {
  // "It is important" has the definition shape but no term to put on the front.
  assert.deepEqual(cardsFromNotes("It is important to study for the exam tonight okay."), []);
});

/* --------------------------------- SRS --------------------------------- */

test("a correct answer schedules the card further out each time", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  let c = card();
  const gaps: number[] = [];
  for (let i = 0; i < 4; i++) {
    c = review(c, "good", now);
    gaps.push(intervalDays(c.streak, c.ease));
  }
  assert.deepEqual(gaps, [1, 3, 7, 16]);
  assert.equal(c.correct, 4);
});

test("a miss resets the streak and returns the card within the session", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const c = review(card({ streak: 4, seen: 4, correct: 4 }), "again", now);
  assert.equal(c.streak, 0);
  assert.equal(c.lapses, 1);
  const minutesOut = (Date.parse(c.dueAt!) - now.getTime()) / 60000;
  assert.equal(minutesOut, 10);
});

test("ease stays inside its bounds however the student answers", () => {
  let c = card();
  for (let i = 0; i < 30; i++) c = review(c, "again");
  assert.ok(c.ease >= 1.3, `ease floor: ${c.ease}`);
  for (let i = 0; i < 30; i++) c = review(c, "easy");
  assert.ok(c.ease <= 3.0, `ease ceiling: ${c.ease}`);
});

test("intervals keep growing past the end of the table, then cap at a year", () => {
  assert.ok(intervalDays(7, 2.5) > intervalDays(6, 2.5));
  assert.ok(intervalDays(6, 2.5) > intervalDays(5, 2.5));
  // Uncapped this compounds to Infinity and yields an invalid Date.
  assert.equal(intervalDays(60, 3.0), 365);
});

test("any correct answer schedules at least a day out, unlike a miss", () => {
  // Regression: "hard" on a brand-new card used to leave streak at 0, giving it
  // the same 10-minute gap as "again".
  const hard = review(card(), "hard");
  assert.equal(hard.streak, 1);
  assert.ok(intervalDays(hard.streak, hard.ease) >= 1);
});

test("mastery tracks the streak", () => {
  assert.equal(mastery(card()), "new");
  assert.equal(mastery(card({ seen: 1, streak: 1 })), "learning");
  assert.equal(mastery(card({ seen: 4, streak: 3 })), "familiar");
  assert.equal(mastery(card({ seen: 9, streak: 6 })), "mastered");
  assert.equal(deckMastery([card({ streak: 5 }), card({ streak: 0 })]), 50);
});

test("the queue puts overdue cards first, then new ones", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  const overdue = card({ id: "overdue", seen: 3, streak: 1, dueAt: "2026-01-01T00:00:00Z" });
  const fresh = card({ id: "fresh", seen: 0, dueAt: null });
  const ahead = card({ id: "ahead", seen: 5, streak: 4, dueAt: "2026-02-01T00:00:00Z" });
  const q = buildQueue([ahead, fresh, overdue], now);
  assert.deepEqual(q.map((c) => c.id), ["overdue", "fresh", "ahead"]);
});

test("the queue respects the session limit", () => {
  const cards = Array.from({ length: 40 }, (_, i) => card({ id: `c${i}` }));
  assert.equal(buildQueue(cards, new Date(), 20).length, 20);
});

test("hydrate repairs a card missing every optional field", () => {
  const c = hydrateCard({ id: "x" } as CardDTO);
  assert.equal(c.streak, 0);
  assert.equal(c.ease, 2.5);
  assert.equal(c.dueAt, null);
});

/* -------------------------------- report ------------------------------- */

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`✓ ${passed} practice tests passed`);
