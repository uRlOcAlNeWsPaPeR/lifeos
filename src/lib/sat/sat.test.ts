/**
 * SAT Prep rule checks — the behavior ported from ScoreClimb.
 *
 *   npx tsx src/lib/sat/sat.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  checkSpr,
  defaultState,
  domainBreakdown,
  finishSetBadges,
  gradeFlash,
  flashBox,
  liveStreak,
  migrateProfile,
  numVal,
  parseState,
  prediction,
  qotdCandidates,
  recordAnswer,
  sectionEstimate,
  startTotal,
  suggestTargets,
  todayStr,
  totalEstimate,
} from "./engine";
import { buildModule, gradeModule, newExam, routeFor, scoreExam, scoreSection } from "./exam";
import { addHighlight, annotsFor, colorOf, highlightAt, isUnderlined, overlaps, removeRange, setColor, setNote, setUnderline, withAnnots, type Highlight } from "./highlights";
import type { CatalogRow, ExamModule, Question, SatState } from "./types";

const NOW = new Date(2026, 8, 21, 12); // 21 Sep 2026, local noon

const q = (over: Partial<Question> = {}): Question => ({
  id: "q1",
  section: "math",
  domain: "H",
  domainDesc: "Algebra",
  skill: "H.A.",
  skillDesc: "Linear equations in one variable",
  difficulty: "M",
  type: "mcq",
  stem: "",
  stimulus: "",
  options: ["a", "b", "c", "d"],
  correct: ["B"],
  ...over,
});

const withProfile = (s: SatState = defaultState()) => {
  s.profile = {
    name: "Sid",
    tests: {
      sat: { testDate: null, targetScore: 1400, prevScore: null },
      psat: { testDate: null, targetScore: 1300, prevScore: null },
    },
    dailyGoal: 10,
  };
  return s;
};

/* ---------------------------- answer checking ---------------------------- */

test("numVal reads fractions, commas and decimals", () => {
  assert.equal(numVal("3/4"), 0.75);
  assert.equal(numVal("-1/2"), -0.5);
  assert.equal(numVal("1,200"), 1200);
  assert.ok(Number.isNaN(numVal("abc")));
  assert.ok(Number.isNaN(numVal("1/0")));
});

test("typed answers match by text or by value", () => {
  const spr = { correct: ["3/4", ".75"] };
  assert.equal(checkSpr(spr, "3/4"), true);
  assert.equal(checkSpr(spr, "0.75"), true);
  assert.equal(checkSpr(spr, " 3 / 4 "), true);
  assert.equal(checkSpr(spr, "0.7"), false);
  assert.equal(checkSpr(spr, "hello"), false);
});

/* ------------------------------- recording ------------------------------- */

test("a correct answer earns difficulty XP and updates every stat", () => {
  const s = withProfile();
  const out = recordAnswer(s, q({ difficulty: "H" }), true, "B", NOW);
  assert.equal(out.xp, 15);
  assert.equal(s.xp, 15);
  assert.equal(s.skills["H.A."].correct, 1);
  assert.equal(s.domains.H.attempts, 1);
  assert.equal(s.sectionStats.math.att, 1);
  assert.equal(s.sectionStats.math.wcorr, 1.2);
  assert.equal(s.counters.hardCorrect, 1);
  assert.equal(s.history[todayStr(0, NOW)].answered, 1);
  assert.equal(s.seen.q1, true);
});

test("a wrong answer banks 2 XP and joins the mistakes list with what you picked", () => {
  const s = withProfile();
  recordAnswer(s, q(), false, "A", NOW);
  assert.equal(s.xp, 2);
  assert.deepEqual(s.missed, ["q1"]);
  assert.equal(s.missedAnswers.q1, "A");
  assert.equal(s.counters.inARow, 0);
});

test("getting a missed question right clears it from mistakes", () => {
  const s = withProfile();
  recordAnswer(s, q(), false, "A", NOW);
  recordAnswer(s, q(), true, "B", NOW);
  assert.deepEqual(s.missed, []);
  assert.equal("q1" in s.missedAnswers, false);
});

test("the streak starts at 1, extends from yesterday, and resets after a gap", () => {
  const s = withProfile();
  const first = recordAnswer(s, q(), true, "B", NOW);
  assert.equal(first.streakNow, 1);
  // A second answer the same day doesn't re-announce the streak.
  assert.equal(recordAnswer(s, q({ id: "q2" }), true, "B", NOW).streakNow, null);

  const tomorrow = new Date(2026, 8, 22, 12);
  assert.equal(recordAnswer(s, q({ id: "q3" }), true, "B", tomorrow).streakNow, 2);

  const later = new Date(2026, 8, 30, 12);
  assert.equal(liveStreak(s, later), 0, "a gap drops the live streak to 0");
  assert.equal(recordAnswer(s, q({ id: "q4" }), true, "B", later).streakNow, 1);
  assert.equal(s.streak.best, 2);
});

test("ten in a row earns Sharpshooter exactly once", () => {
  const s = withProfile();
  const earned: string[] = [];
  for (let i = 0; i < 12; i++) {
    earned.push(...recordAnswer(s, q({ id: `q${i}` }), true, "B", NOW).newBadges.map((b) => b.id));
  }
  assert.deepEqual(earned.filter((id) => id === "sharp"), ["sharp"]);
});

test("a 90% ten-question math set earns First Steps and Math Whiz", () => {
  const s = withProfile();
  const qs = Array.from({ length: 10 }, (_, i) => q({ id: `m${i}` }));
  const ids = finishSetBadges(s, qs, 9).map((b) => b.id);
  assert.deepEqual(ids, ["first", "mathwhiz"]);
  // Already earned — not awarded twice.
  assert.deepEqual(finishSetBadges(s, qs, 10), []);
});

/* ------------------------------ score model ------------------------------ */

test("with no practice, the estimate is the scale midpoint", () => {
  const s = withProfile();
  assert.equal(sectionEstimate(s, "sat", "rw"), 500);
  assert.equal(totalEstimate(s, "sat"), 1000);
  assert.equal(totalEstimate(s, "psat"), 920);
  assert.equal(startTotal(s, "sat"), 1000);
});

test("a previous score sets the starting point", () => {
  const s = withProfile();
  s.profile!.tests.sat.prevScore = 1200;
  assert.equal(startTotal(s, "sat"), 1200);
  assert.equal(sectionEstimate(s, "sat", "math"), 600);
});

test("practice pulls the estimate toward measured accuracy, weighted by volume", () => {
  const s = withProfile();
  // 15 medium math questions, all correct: w = 15/30 = 0.5, perf = 800.
  s.sectionStats.math = { att: 15, corr: 15, wsum: 15, wcorr: 15 };
  assert.equal(sectionEstimate(s, "sat", "math"), 650);
});

test("the predicted range narrows as you answer more", () => {
  const s = withProfile();
  const fresh = prediction(s, "sat");
  assert.equal(fresh.hi - fresh.lo, 320);
  s.counters.answered = 300;
  const practiced = prediction(s, "sat");
  assert.equal(practiced.hi - practiced.lo, 80);
  assert.equal(practiced.gap, 1400 - practiced.est);
});

test("suggested targets sit 150 above the start, converted across scales", () => {
  assert.deepEqual(suggestTargets("SAT", 1200), { sat: 1350, psat: 1290 });
  assert.deepEqual(suggestTargets("PSAT", 1000), { sat: 1200, psat: 1150 });
  assert.deepEqual(suggestTargets("none", null), { sat: 1150, psat: 1100 });
  assert.deepEqual(suggestTargets("SAT", 1550), { sat: 1600, psat: 1520 });
});

/* ------------------------------- breakdown ------------------------------- */

test("domains sort weakest first and label focus/strength only with enough data", () => {
  const rows = domainBreakdown(
    { H: { attempts: 5, correct: 1 }, P: { attempts: 5, correct: 5 }, Q: { attempts: 1, correct: 0 } },
    "math",
  );
  assert.equal(rows[0].code, "Q", "0% sorts first even with one attempt");
  assert.equal(rows.find((r) => r.code === "H")!.tag, "weak");
  assert.equal(rows.find((r) => r.code === "P")!.tag, "strong");
  assert.equal(rows.find((r) => r.code === "Q")!.tag, null, "too few attempts to label");
  assert.equal(rows.find((r) => r.code === "S")!.acc, null);
});

test("no labels when only one domain has enough attempts", () => {
  const rows = domainBreakdown({ H: { attempts: 9, correct: 3 } }, "math");
  assert.ok(rows.every((r) => r.tag === null));
});

/* ------------------------------- state I/O ------------------------------- */

test("an old flat profile migrates to per-test tracks", () => {
  const s = defaultState();
  // The legacy shape predates `tests`, so it doesn't fit today's Profile type.
  (s as unknown as { profile: unknown }).profile = { name: "Old", testDate: "2026-10-03", targetScore: 1450, prevScore: 1100, prevType: "SAT", dailyGoal: 5 };
  assert.equal(migrateProfile(s), true);
  assert.deepEqual(s.profile!.tests.sat, { testDate: "2026-10-03", targetScore: 1450, prevScore: 1100 });
  assert.equal(s.profile!.tests.psat.targetScore, 1210);
  assert.equal("testDate" in s.profile!, false);
});

test("a backup fills in any fields it predates", () => {
  const s = parseState({ xp: 99, profile: null });
  assert.equal(s.xp, 99);
  assert.deepEqual(s.examHistory, []);
  assert.deepEqual(s.sectionStats.rw, { att: 0, corr: 0, wsum: 0, wcorr: 0 });
});

test("junk storage parses to a clean default", () => {
  assert.deepEqual(parseState(null), defaultState());
  assert.deepEqual(parseState("nope"), defaultState());
});

/* ------------------------------ flashcards ------------------------------ */

test("Leitner boxes climb to 4 on a known card and reset on a miss", () => {
  const s = defaultState();
  for (let i = 0; i < 6; i++) gradeFlash(s, "v:acumen", true);
  assert.equal(flashBox(s, "v:acumen"), 4);
  gradeFlash(s, "v:acumen", false);
  assert.equal(flashBox(s, "v:acumen"), 0);
  assert.equal(flashBox(s, "v:unseen"), 0);
});

test("question of the day is stable for a day and differs by section", () => {
  const a = qotdCandidates("2026-09-21", "rw", 500);
  assert.deepEqual(a, qotdCandidates("2026-09-21", "rw", 500));
  assert.notDeepEqual(a, qotdCandidates("2026-09-21", "math", 500));
  assert.ok(a.every((i) => i >= 0 && i < 500));
});

/* --------------------------------- exams --------------------------------- */

/** A synthetic pool: `n` rows per difficulty for a section. */
const pool = (section: "rw" | "math", n: number): CatalogRow[] =>
  (["E", "M", "H"] as const).flatMap((d) =>
    Array.from({ length: n }, (_, i) => ({
      qid: `${section}${d}${i}`, key: `${section}-${d}-${i}`, domain: "H", skill: "H.A.",
      difficulty: d, section, skillDesc: "",
    })),
  );

test("a base module is 27 R&W questions at a 30/40/30 mix, easy to hard", () => {
  const ex = newExam("sat", null, NOW);
  const mod = buildModule(ex, "rw", "base", pool("rw", 40));
  assert.equal(mod.total, 27);
  assert.equal(mod.timeLeft, 32 * 60);
  const count = (d: string) => mod.qids.filter((k) => k.includes(`-${d}-`)).length;
  assert.deepEqual([count("E"), count("M"), count("H")], [8, 11, 8]);
  const order = mod.qids.map((k) => "EMH".indexOf(k.split("-")[1]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "ramps easy → hard");
});

test("the hard route leans hard; math modules are 22 questions over 35 minutes", () => {
  const ex = newExam("sat", null, NOW);
  const mod = buildModule(ex, "math", "hard", pool("math", 40));
  assert.equal(mod.total, 22);
  assert.equal(mod.timeLeft, 35 * 60);
  assert.equal(mod.qids.filter((k) => k.includes("-H-")).length, 11);
});

test("a thin bucket is topped up from the others", () => {
  const rows = pool("rw", 40).filter((r) => r.difficulty !== "H" || r.key.endsWith("-0"));
  const mod = buildModule(newExam("sat", null, NOW), "rw", "base", rows);
  assert.equal(mod.total, 27);
});

test("modules within one exam never repeat a question", () => {
  const ex = newExam("sat", null, NOW);
  const rows = pool("rw", 40);
  ex.modules.push(buildModule(ex, "rw", "base", rows));
  ex.modules.push(buildModule(ex, "rw", "hard", rows));
  const all = ex.modules.flatMap((m) => m.qids);
  assert.equal(new Set(all).size, all.length);
});

test("library exam N always draws the same questions", () => {
  const rows = pool("math", 40);
  const a = buildModule(newExam("sat", 3, NOW), "math", "base", rows);
  const b = buildModule(newExam("sat", 3, NOW), "math", "base", rows);
  const c = buildModule(newExam("sat", 4, NOW), "math", "base", rows);
  assert.deepEqual(a.qids, b.qids);
  assert.notDeepEqual(a.qids, c.qids);
});

const mod = (over: Partial<ExamModule>): ExamModule => ({
  section: "rw", route: "base", qids: [], total: 27, answers: {}, flagged: {}, crossed: {},
  timeLeft: 0, at: 0, submitted: true, correct: 0, warned: false, ...over,
});

test("60% on module 1 routes to the harder module 2", () => {
  assert.equal(routeFor(mod({ total: 10, correct: 6 })), "hard");
  assert.equal(routeFor(mod({ total: 10, correct: 5 })), "easy");
});

test("scaled scores: hard route bonus, easy route ceiling, clamped to the scale", () => {
  // 54/54 on the hard route: 800 + 20 → clamped to 800.
  assert.equal(scoreSection("sat", mod({ correct: 27 }), mod({ correct: 27, route: "hard" })), 800);
  // 54/54 on the easy route is capped at 200 + 600 × 0.72 = 632 → 630.
  assert.equal(scoreSection("sat", mod({ correct: 27 }), mod({ correct: 27, route: "easy" })), 630);
  // Half right on the hard route: 200 + 300 + 20 = 520.
  assert.equal(scoreSection("sat", mod({ correct: 14 }), mod({ correct: 13, route: "hard" })), 520);
  // Nothing right still earns the floor.
  assert.equal(scoreSection("psat", mod({ correct: 0 }), mod({ correct: 0, route: "easy" })), 160);
});

test("grading counts only correct answers; unloadable questions score wrong", () => {
  const bank = new Map([["a", q({ id: "a" })], ["b", q({ id: "b", type: "spr", correct: ["12"] })]]);
  const m = mod({ qids: ["a", "b", "gone"], answers: { a: "B", b: "12.0", gone: "A" } });
  assert.equal(gradeModule(m, (id) => bank.get(id)), 2);
});

test("an exam result lists every missed or skipped question for review", () => {
  const bank = new Map(["a", "b", "c", "d"].map((id) => [id, q({ id })]));
  const ex = newExam("sat", null, NOW);
  ex.modules = [
    mod({ qids: ["a", "b"], total: 2, answers: { a: "B", b: "A" }, correct: 1 }),
    mod({ qids: ["c"], total: 1, answers: {}, correct: 0, route: "easy" }),
    mod({ section: "math", qids: ["d"], total: 1, answers: { d: "B" }, correct: 1 }),
    mod({ section: "math", qids: [], total: 1, correct: 0, route: "easy" }),
  ];
  const r = scoreExam(ex, (id) => bank.get(id), "2026-09-21");
  assert.deepEqual(r.modules[0].review, [{ id: "b", given: "A" }]);
  assert.deepEqual(r.modules[1].review, [{ id: "c", given: undefined }]);
  assert.equal(r.total, r.rw + r.math);
  // Buckets follow each question's own section: a, b and d were answered (c skipped).
  assert.equal(r.examDomains.math.H.attempts, 3);
  assert.equal(r.examDomains.math.H.correct, 2);
});

/* ------------------------------ highlighting ------------------------------ */

const hl = (start: number, end: number, color: Highlight["color"] = "yellow"): Highlight => ({ start, end, color });

test("a highlight is added as a span of the passage's text", () => {
  assert.deepEqual(addHighlight([], hl(5, 12)), [hl(5, 12)]);
});

test("highlights stay sorted however they were added", () => {
  const out = addHighlight(addHighlight([], hl(40, 50)), hl(5, 12));
  assert.deepEqual(out.map((h) => h.start), [5, 40]);
});

test("highlighting over an existing one in another colour replaces it, not stacks it", () => {
  const out = addHighlight([hl(10, 30, "yellow")], hl(20, 40, "blue"));
  assert.deepEqual(out, [hl(10, 20, "yellow"), hl(20, 40, "blue")]);
});

test("a new highlight inside a bigger one splits it around the new colour", () => {
  const out = addHighlight([hl(0, 100, "yellow")], hl(40, 60, "pink"));
  assert.deepEqual(out, [hl(0, 40, "yellow"), hl(40, 60, "pink"), hl(60, 100, "yellow")]);
});

test("touching or overlapping highlights of the same colour join into one", () => {
  assert.deepEqual(addHighlight([hl(0, 10)], hl(10, 20)), [hl(0, 20)]);
  assert.deepEqual(addHighlight([hl(0, 15)], hl(10, 20)), [hl(0, 20)]);
});

test("removing part of a highlight leaves the rest, and removing it all clears it", () => {
  assert.deepEqual(removeRange([hl(0, 100)], 40, 60), [hl(0, 40), hl(60, 100)]);
  assert.deepEqual(removeRange([hl(10, 20)], 0, 50), []);
  assert.deepEqual(removeRange([hl(10, 20)], 30, 40), [hl(10, 20)]);
});

test("an empty selection changes nothing", () => {
  const list = [hl(1, 5)];
  assert.equal(addHighlight(list, hl(7, 7)), list);
  assert.equal(removeRange(list, 3, 3), list);
});

test("highlight edits never mutate the list they were given", () => {
  const list = [hl(0, 100)];
  addHighlight(list, hl(40, 60, "blue"));
  removeRange(list, 40, 60);
  assert.deepEqual(list, [hl(0, 100)]);
});

test("overlap and lookup agree about where a highlight is", () => {
  const list = [hl(10, 20)];
  assert.equal(overlaps(list, 15, 25), true);
  assert.equal(overlaps(list, 20, 30), false, "end is exclusive");
  assert.equal(highlightAt(list, 10)?.color, "yellow");
  assert.equal(highlightAt(list, 20), null);
});


test("a note is set on the highlight covering the span, and blank text clears it", () => {
  let list: Highlight[] = addHighlight([], { start: 4, end: 12, color: "yellow" });
  list = setNote(list, 4, 12, "  main claim ");
  assert.equal(list[0].note, "main claim");
  list = setNote(list, 4, 12, "   ");
  assert.equal("note" in list[0], false);
});

test("a highlight with a note is not joined into a neighbour", () => {
  let list: Highlight[] = addHighlight([], { start: 0, end: 5, color: "yellow" });
  list = addHighlight(list, { start: 5, end: 10, color: "yellow", note: "x" });
  assert.equal(list.length, 2);
  assert.equal(list[1].note, "x");
});

test("removing the middle of a noted highlight keeps the note on the first piece only", () => {
  const list = removeRange([{ start: 0, end: 20, color: "blue", note: "keep" }], 8, 12);
  assert.deepEqual(list, [
    { start: 0, end: 8, color: "blue", note: "keep" },
    { start: 12, end: 20, color: "blue" },
  ]);
});

test("ScoreClimb's saved highlights are read back — yellow, with their notes", () => {
  // The shape ScoreClimb itself writes into an exam: no colour, a note ("" for none).
  const saved = [
    { c: "s", start: 4, end: 20, note: "" },
    { c: "t", start: 0, end: 5, note: "check the verb" },
    { c: "s", start: 30, end: 40, note: "main idea" },
  ];
  assert.deepEqual(annotsFor(saved, "s"), [
    { start: 4, end: 20, color: "yellow" },
    { start: 30, end: 40, color: "yellow", note: "main idea" },
  ]);
  assert.deepEqual(annotsFor(saved, "t"), [{ start: 0, end: 5, color: "yellow", note: "check the verb" }]);
});

test("a saved highlight that's malformed is dropped instead of breaking the passage", () => {
  const saved = [null, 7, { c: "s", start: -1, end: 5 }, { c: "s", start: 9, end: 9 }, { c: "s", start: 1.5, end: 4 }, { c: "s", start: 2, end: 6, color: "pink", note: 5 }];
  assert.deepEqual(annotsFor(saved, "s"), [{ start: 2, end: 6, color: "pink" }]);
  assert.deepEqual(annotsFor(undefined, "s"), []);
  assert.deepEqual(annotsFor("junk", "t"), []);
});

test("nothing saved reads as the same empty list every time, so a repaint isn't triggered", () => {
  assert.equal(annotsFor(undefined, "s"), annotsFor([], "t"));
});

test("writing one part's highlights leaves the other part untouched", () => {
  const saved = [
    { c: "t", start: 0, end: 5, note: "keep me" },
    { c: "s", start: 10, end: 20, note: "" },
  ];
  const out = withAnnots(saved, "s", [{ start: 3, end: 9, color: "blue", note: "new" }]);
  assert.deepEqual(out, [
    { c: "t", start: 0, end: 5, note: "keep me" },
    { c: "s", start: 3, end: 9, note: "new", color: "blue" },
  ]);
  assert.deepEqual(withAnnots(undefined, "t", []), [], "an empty edit saves nothing");
});

test("what LifeOS saves reads back the same, and is in ScoreClimb's shape", () => {
  const marks: Highlight[] = [{ start: 5, end: 15, color: "pink", note: "why?" }, { start: 20, end: 30, color: "yellow" }];
  const saved = withAnnots(undefined, "s", marks);
  assert.deepEqual(annotsFor(saved, "s"), marks);
  for (const a of saved) assert.ok(a.c && typeof a.start === "number" && typeof a.end === "number" && typeof a.note === "string");
});

/* ---------------------- Highlights & Notes: underline ---------------------- */

test("underlining words with no highlight is an underline on its own", () => {
  assert.deepEqual(setUnderline([], 5, 15, true), [{ start: 5, end: 15, underline: true }]);
});

test("underline and colour stack on the same words, in either order", () => {
  const a = setUnderline(setColor([], 5, 15, "blue"), 5, 15, true);
  const b = setColor(setUnderline([], 5, 15, true), 5, 15, "blue");
  assert.deepEqual(a, [{ start: 5, end: 15, color: "blue", underline: true }]);
  assert.deepEqual(b, a);
});

test("changing the colour keeps the underline, and the underline keeps the colour", () => {
  const both = [{ start: 0, end: 10, color: "yellow", underline: true } as Highlight];
  assert.deepEqual(setColor(both, 0, 10, "pink"), [{ start: 0, end: 10, color: "pink", underline: true }]);
  assert.deepEqual(setUnderline(both, 0, 10, false), [{ start: 0, end: 10, color: "yellow" }]);
});

test("taking the underline off an underline-only mark removes it entirely", () => {
  assert.deepEqual(setUnderline([{ start: 0, end: 10, underline: true }], 0, 10, false), []);
});

test("underlining part of a highlight splits it and leaves the rest as it was", () => {
  const out = setUnderline([{ start: 0, end: 30, color: "yellow" }], 10, 20, true);
  assert.deepEqual(out, [
    { start: 0, end: 10, color: "yellow" },
    { start: 10, end: 20, color: "yellow", underline: true },
    { start: 20, end: 30, color: "yellow" },
  ]);
});

test("a selection spanning plain text and a highlight gets underlined all the way", () => {
  const out = setUnderline([{ start: 10, end: 20, color: "blue" }], 5, 25, true);
  assert.equal(isUnderlined(out, 5, 25), true);
  assert.equal(colorOf(out, 10, 20), "blue", "the colour stays on the words that had it");
  assert.equal(colorOf(out, 5, 25), null, "but the whole span isn't one colour");
});

test("isUnderlined is false while any part is missing it", () => {
  const out = setUnderline([], 0, 10, true);
  assert.equal(isUnderlined(out, 0, 10), true);
  assert.equal(isUnderlined(out, 0, 12), false);
  assert.equal(isUnderlined([], 3, 3), false);
});

test("colorOf is the colour only when one covers the whole selection", () => {
  const list: Highlight[] = [{ start: 0, end: 10, color: "pink" }];
  assert.equal(colorOf(list, 2, 8), "pink");
  assert.equal(colorOf(list, 2, 12), null);
  assert.equal(colorOf([{ start: 0, end: 5, color: "pink" }, { start: 5, end: 10, color: "blue" }], 0, 10), null);
});

test("restyling part of a noted highlight keeps its note on exactly one piece", () => {
  const out = setColor([{ start: 0, end: 30, color: "yellow", note: "key idea" }], 10, 20, "blue");
  assert.equal(out.filter((h) => h.note === "key idea").length, 1);
  assert.equal(out.find((h) => h.note)?.start, 0, "it stays with the first piece");
});

test("an underline-only mark survives being saved and read back, and says so for ScoreClimb", () => {
  const marks: Highlight[] = [
    { start: 0, end: 5, underline: true },
    { start: 10, end: 20, color: "blue", underline: true, note: "n" },
  ];
  const saved = withAnnots(undefined, "s", marks);
  assert.equal(saved[0].color, "none");
  assert.deepEqual(annotsFor(saved, "s"), marks);
});

test("a ScoreClimb highlight with no colour is still yellow, not an underline", () => {
  assert.deepEqual(annotsFor([{ c: "s", start: 1, end: 4, note: "" }], "s"), [{ start: 1, end: 4, color: "yellow" }]);
});

report("sat");
