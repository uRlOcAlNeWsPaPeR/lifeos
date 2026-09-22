/**
 * Search ranking checks.
 *
 *   npx tsx src/lib/search.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import { fold, score, searchAll, PAGES, type SearchInput } from "@/lib/search";

/** A small but realistic workspace. Cast through unknown — search only reads a
 *  handful of fields, and spelling out full DTOs here would obscure the cases. */
const DATA = {
  tasks: [
    { id: "t1", title: "Study for physics test", courseId: "c1", notes: "covers momentum", category: null },
    { id: "t2", title: "Physics lab writeup", courseId: "c1", notes: null, category: null },
    { id: "t3", title: "Email counselor", courseId: null, notes: null, category: null },
  ],
  assignments: [{ id: "a1", title: "Momentum problem set", courseId: "c1", description: null }],
  courses: [
    { id: "c1", name: "Physics", code: "PHY101", instructor: "Ms. York", term: "Fall" },
    { id: "c2", name: "Mathematics Extension 2 Revision", code: null, instructor: null, term: null },
    { id: "c3", name: "Math", code: null, instructor: null, term: null },
  ],
  decks: [{ id: "d1", title: "Bio unit 4", cards: [{ front: "Mitosis" }, { front: "Meiosis" }] }],
  goals: [{ id: "g1", title: "Get an A in Physics", description: null, category: "Physics" }],
  events: [{ id: "e1", title: "Physics tutoring", location: "Room 12", description: null }],
} as unknown as SearchInput;

const find = (q: string) => searchAll(q, DATA);
const titles = (q: string) => find(q).map((r) => r.title);

test("fold strips case, accents and punctuation", () => {
  assert.equal(fold("  Café — Ünit 4! "), "cafe unit 4");
});

test("an empty query returns nothing", () => {
  assert.deepEqual(find(""), []);
  assert.deepEqual(find("   "), []);
});

test("a query that matches nothing returns nothing", () => {
  assert.deepEqual(find("zzzzqqq"), []);
});

test("search spans every kind of content", () => {
  const kinds = new Set(find("physics").map((r) => r.kind));
  for (const k of ["course", "task", "goal", "event"]) {
    assert.ok(kinds.has(k as never), `expected a ${k} result for "physics"`);
  }
});

test("an exact title outranks a longer title containing it", () => {
  // "Math" must beat "Mathematics Extension 2 Revision".
  assert.equal(titles("math")[0], "Math");
  assert.ok(score("math", "Math") > score("math", "Mathematics Extension 2 Revision"));
});

test("pages are findable by what they do, not just their name", () => {
  assert.deepEqual(titles("gpa"), ["Grades"]);
  assert.ok(titles("flashcard").includes("Practice"));
  assert.ok(titles("flashcard").includes("SAT flashcards"));
  assert.equal(titles("predicted score")[0], "SAT progress");
  assert.deepEqual(titles("bedtime"), ["Settings"]);
  // The page is named "School"; typing "courses" must still find it.
  assert.ok(titles("courses").includes("School"));
});

test("a deck is findable by the cards inside it", () => {
  const hit = find("mitosis")[0];
  assert.equal(hit.kind, "deck");
  assert.equal(hit.href, "/practice/d1");
});

test("extra terms narrow the results instead of widening them", () => {
  assert.ok(find("physics").length > 1);
  assert.deepEqual(titles("physics lab"), ["Physics lab writeup"]);
});

test("every result carries a route that goes somewhere", () => {
  for (const r of find("physics")) {
    assert.ok(r.href.startsWith("/"), `bad href: ${r.href}`);
  }
});

test("one huge collection cannot crowd out the others", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    id: `t${i}`, title: `Physics task ${i}`, courseId: null, notes: null, category: null,
  }));
  const results = searchAll("physics", { ...DATA, tasks: many } as unknown as SearchInput);
  assert.ok(results.filter((r) => r.kind === "task").length <= 5);
  assert.ok(results.some((r) => r.kind === "course"), "courses were crowded out");
});

test("every page in the palette has a unique, rooted href", () => {
  const hrefs = PAGES.map((p) => p.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "duplicate page href");
  for (const h of hrefs) assert.ok(h.startsWith("/"), `bad page href: ${h}`);
});

report("search");
