/**
 * Multi-screenshot merge checks.
 *
 *   npx tsx src/lib/screenshot-merge.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  canonicalCategory,
  mergeItems,
  mergeWeights,
  titleKey,
  type ScreenshotDraft,
} from "./screenshot-merge";

const item = (title: string, over: Partial<ScreenshotDraft> = {}): ScreenshotDraft => ({
  title,
  dueAt: "",
  notes: "",
  pointsPossible: "",
  pointsEarned: "",
  gradeValue: "",
  category: "",
  keep: true,
  ...over,
});

const titles = (xs: ScreenshotDraft[]) => xs.map((x) => x.title);

/* --------------------------------- items --------------------------------- */

test("a second screenshot's new items are appended in the order shown", () => {
  const r = mergeItems([item("Quiz 1"), item("Quiz 2")], [item("Quiz 3"), item("Quiz 4")]);
  assert.deepEqual(titles(r.items), ["Quiz 1", "Quiz 2", "Quiz 3", "Quiz 4"]);
  assert.equal(r.added, 2);
  assert.equal(r.merged, 0);
});

test("the overlap between two screenshots isn't listed twice", () => {
  // Screenshot 2 starts on the last row of screenshot 1.
  const r = mergeItems(
    [item("Lab 1"), item("Lab 2"), item("Lab 3")],
    [item("Lab 3"), item("Lab 4")],
  );
  assert.deepEqual(titles(r.items), ["Lab 1", "Lab 2", "Lab 3", "Lab 4"]);
  assert.equal(r.merged, 1);
  assert.equal(r.added, 1);
});

test("case, spacing and punctuation don't make a repeat look new", () => {
  assert.equal(titleKey("Unit 3: Test!"), titleKey("unit 3   test"));
  const r = mergeItems([item("Unit 3: Test")], [item("unit 3 test")]);
  assert.equal(r.items.length, 1);
});

test("the same title on different dates is a recurring assignment, not a repeat", () => {
  const r = mergeItems(
    [item("Weekly reflection", { dueAt: "2026-09-08" })],
    [item("Weekly reflection", { dueAt: "2026-09-15" })],
  );
  assert.equal(r.items.length, 2);
});

test("a repeat with the date cropped off is still recognised", () => {
  const r = mergeItems([item("Essay", { dueAt: "2026-10-01" })], [item("Essay")]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].dueAt, "2026-10-01");
});

test("a repeat fills in what the first read missed", () => {
  // The score sits on the row but was cut off in the first screenshot.
  const r = mergeItems(
    [item("Quiz 5", { pointsPossible: "20" })],
    [item("Quiz 5", { pointsPossible: "20", pointsEarned: "18", category: "Formative" })],
  );
  assert.equal(r.items[0].pointsEarned, "18");
  assert.equal(r.items[0].category, "Formative");
});

test("a repeat never overwrites a value that's already there", () => {
  const r = mergeItems(
    [item("Quiz 5", { pointsEarned: "17", category: "Homework" })],
    [item("Quiz 5", { pointsEarned: "18", category: "Formative" })],
  );
  assert.equal(r.items[0].pointsEarned, "17");
  assert.equal(r.items[0].category, "Homework");
});

test("an item the student unchecked stays unchecked when it shows up again", () => {
  const r = mergeItems([item("Sidebar junk", { keep: false })], [item("Sidebar junk")]);
  assert.equal(r.items[0].keep, false);
});

test("merging never mutates the lists it was given", () => {
  const existing = [item("A")];
  const incoming = [item("A", { pointsEarned: "5" })];
  mergeItems(existing, incoming);
  assert.equal(existing[0].pointsEarned, "");
  assert.equal(incoming[0].pointsEarned, "5");
});

test("an untitled row never matches anything", () => {
  const r = mergeItems([item("")], [item("")]);
  assert.equal(r.items.length, 2);
});

/* -------------------------------- weights -------------------------------- */

test("a category from the second screenshot is added to the table", () => {
  const r = mergeWeights([{ category: "Formative", weight: "30" }], [{ category: "Summative", weight: "70" }]);
  assert.deepEqual(r, [
    { category: "Formative", weight: "30" },
    { category: "Summative", weight: "70" },
  ]);
});

test("categories match case-insensitively, so a category isn't listed twice", () => {
  const r = mergeWeights([{ category: "Formative", weight: "30" }], [{ category: "formative", weight: "30" }]);
  assert.equal(r.length, 1);
});

test("a blank weight is filled in by a later screenshot, but a set one is kept", () => {
  const filled = mergeWeights([{ category: "Tests", weight: "" }], [{ category: "Tests", weight: "50" }]);
  assert.equal(filled[0].weight, "50");
  const kept = mergeWeights([{ category: "Tests", weight: "40" }], [{ category: "Tests", weight: "50" }]);
  assert.equal(kept[0].weight, "40", "the student may have corrected it");
});

test("a nameless category row is ignored", () => {
  assert.deepEqual(mergeWeights([], [{ category: "  ", weight: "10" }]), []);
});

/* ------------------------------- categories ------------------------------ */

test("a category label resolves to the spelling already in use", () => {
  assert.equal(canonicalCategory("formative", ["Formative", "Summative"]), "Formative");
  assert.equal(canonicalCategory("  SUMMATIVE ", ["Formative", "Summative"]), "Summative");
});

test("an unknown label is kept as read, and no label is empty", () => {
  assert.equal(canonicalCategory("Labs", ["Formative"]), "Labs");
  assert.equal(canonicalCategory(null, ["Formative"]), "");
  assert.equal(canonicalCategory("   ", ["Formative"]), "");
});

report("screenshot-merge");
