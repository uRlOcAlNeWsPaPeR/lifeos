/**
 * GPA checks — the weighted/unweighted split and the course levels behind it.
 *
 *   npx tsx src/lib/grades.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  DEFAULT_GPA_LEVELS,
  DEFAULT_GPA_POINTS,
  GPA_POINT_PRESETS,
  gpaFromLetter,
  estimateGpa,
  findGpaLevel,
  REGULAR_LEVEL_ID,
  type GpaLevel,
} from "./grades";
import type { CourseDTO } from "./types";

/** A course graded by a typed-in letter — the simplest path to a GPA. */
const course = (grade: string | null, gpaLevel: string | null = null): CourseDTO =>
  ({
    id: `c-${grade}-${gpaLevel}-${Math.random()}`,
    name: "Class",
    currentGrade: grade,
    currentScore: null,
    assignments: [],
    gpaLevel,
  }) as unknown as CourseDTO;

test("no graded classes means no GPA at all", () => {
  const r = estimateGpa([], undefined, DEFAULT_GPA_LEVELS);
  assert.deepEqual(r, { unweighted: null, weighted: null, counted: 0 });
  assert.equal(estimateGpa([course(null)], undefined, DEFAULT_GPA_LEVELS).counted, 0);
});

test("without levels, weighted and unweighted agree", () => {
  const r = estimateGpa([course("A"), course("B")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.unweighted, 3.5);
  assert.equal(r.weighted, 3.5);
  assert.equal(r.counted, 2);
});

test("an AP adds its bonus to the weighted GPA only", () => {
  const r = estimateGpa([course("A", "ap")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.unweighted, 4);
  assert.equal(r.weighted, 5, "an A in an AP is a 5.0");
});

test("honors sits between regular and AP", () => {
  const r = estimateGpa([course("A", "honors")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.weighted, 4.5);
});

test("a mixed schedule averages both ways", () => {
  // A regular (4.0) + B honors (3 + 0.5) → unweighted 3.5, weighted 3.75.
  const r = estimateGpa([course("A"), course("B", "honors")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.unweighted, 3.5);
  assert.equal(r.weighted, 3.75);
});

test("failing a weighted class earns no bonus", () => {
  const r = estimateGpa([course("F", "ap")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.unweighted, 0);
  assert.equal(r.weighted, 0, "an F is a 0.0 however hard the class was");
});

test("a course tagged with a level the student deleted counts as regular", () => {
  const r = estimateGpa([course("A", "gone")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.weighted, 4);
});

test("custom school levels are respected", () => {
  // A school that gives a full point for honors and two for AP.
  const levels: GpaLevel[] = [
    { id: REGULAR_LEVEL_ID, name: "Regular", bonus: 0 },
    { id: "honors", name: "Honors", bonus: 1 },
    { id: "ap", name: "AP", bonus: 2 },
  ];
  assert.equal(estimateGpa([course("A", "honors")], undefined, levels).weighted, 5);
  assert.equal(estimateGpa([course("A", "ap")], undefined, levels).weighted, 6);
});

test("GPA is rounded to two decimals", () => {
  // A + A + B = 11/3 = 3.666…
  const r = estimateGpa([course("A"), course("A"), course("B")], undefined, DEFAULT_GPA_LEVELS);
  assert.equal(r.unweighted, 3.67);
});

test("findGpaLevel resolves an id, and treats unset as no level", () => {
  assert.equal(findGpaLevel(DEFAULT_GPA_LEVELS, "ap")?.bonus, 1);
  assert.equal(findGpaLevel(DEFAULT_GPA_LEVELS, null), null);
  assert.equal(findGpaLevel(DEFAULT_GPA_LEVELS, "nope"), null);
});

test("a school's own letter points change the unweighted GPA", () => {
  const noMinus = { ...DEFAULT_GPA_POINTS, "A-": 4.0 };
  const r = estimateGpa([course("A-")], undefined, DEFAULT_GPA_LEVELS, noMinus);
  assert.equal(r.unweighted, 4);
  assert.equal(estimateGpa([course("A-")], undefined, DEFAULT_GPA_LEVELS).unweighted, 3.7);
});

test("the custom points carry into the weighted GPA too", () => {
  const pts = { ...DEFAULT_GPA_POINTS, "B+": 3.5 };
  assert.equal(estimateGpa([course("B+", "ap")], undefined, DEFAULT_GPA_LEVELS, pts).weighted, 4.5);
});

test("a letter missing from a custom scale falls back to the standard value", () => {
  assert.equal(gpaFromLetter("C", {}), 2);
  assert.equal(gpaFromLetter("Z", {}), null);
});

test("an A+ can be worth more than 4.0 on a 4.3 scale", () => {
  const p = GPA_POINT_PRESETS.find((x) => x.id === "four-three")!.points;
  assert.equal(estimateGpa([course("A+")], undefined, DEFAULT_GPA_LEVELS, p).unweighted, 4.3);
});

test("every preset defines every letter", () => {
  for (const preset of GPA_POINT_PRESETS) {
    for (const l of Object.keys(DEFAULT_GPA_POINTS)) {
      assert.equal(typeof preset.points[l], "number", `${preset.id} lacks ${l}`);
    }
  }
});

report("grades");
