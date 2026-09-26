/**
 * Multi-screenshot merge checks.
 *
 *   npx tsx src/lib/screenshot-merge.test.ts
 */
import assert from "node:assert/strict";
import { test, report } from "@/lib/test-harness";
import {
  canonicalCategory,
  groupByCategory,
  mergeCourseWeights,
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

/* ------------------------------- grouping -------------------------------- */

const labels = (gs: ReturnType<typeof groupByCategory>) => gs.map((g) => g.label);

test("sections follow the screenshot's category order, not alphabetical or by weight", () => {
  const groups = groupByCategory(
    [item("Test 1", { category: "Summative" }), item("Quiz 1", { category: "Formative" })],
    [{ category: "Summative", weight: 70 }, { category: "Formative", weight: 30 }],
  );
  assert.deepEqual(labels(groups), ["Summative", "Formative"]);
});

test("each section carries its weight, and items keep the order they appeared in", () => {
  const groups = groupByCategory(
    [
      item("Quiz 1", { category: "Formative" }),
      item("Test 1", { category: "Summative" }),
      item("Quiz 2", { category: "Formative" }),
    ],
    [{ category: "Formative", weight: 30 }, { category: "Summative", weight: 70 }],
  );
  assert.equal(groups[0].weight, 30);
  assert.deepEqual(groups[0].entries.map((e) => e.item.title), ["Quiz 1", "Quiz 2"]);
  assert.deepEqual(groups[0].entries.map((e) => e.index), [0, 2], "indexes point back into the full list");
  assert.equal(groups[1].weight, 70);
});

test("a category with nothing in it still gets its section", () => {
  const groups = groupByCategory([item("Quiz", { category: "Formative" })], [
    { category: "Formative", weight: 30 },
    { category: "Labs", weight: 70 },
  ]);
  assert.deepEqual(labels(groups), ["Formative", "Labs"]);
  assert.equal(groups[1].entries.length, 0);
});

test("uncategorized items collect in a final section, only when there are some", () => {
  const withNone = groupByCategory([item("Loose", { category: "" })], [{ category: "Tests", weight: 100 }]);
  assert.deepEqual(labels(withNone), ["Tests", "No category"]);
  const without = groupByCategory([item("Test", { category: "Tests" })], [{ category: "Tests", weight: 100 }]);
  assert.deepEqual(labels(without), ["Tests"]);
});

test("category matching ignores case, keeping the screenshot's spelling", () => {
  const groups = groupByCategory([item("Quiz", { category: "formative" })], [{ category: "Formative", weight: 30 }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Formative");
  assert.equal(groups[0].entries.length, 1);
});

test("course categories the screenshot didn't show follow the ones it did", () => {
  const groups = groupByCategory([], [{ category: "Tests", weight: 60 }], [
    { category: "Homework", weight: 40 },
    { category: "tests", weight: 60 },
  ]);
  assert.deepEqual(labels(groups), ["Tests", "Homework"]);
});

test("a tagged category nobody gave a weight to is kept, flagged with no weight", () => {
  const groups = groupByCategory([item("Lab 1", { category: "Labs" })], []);
  assert.equal(groups[0].label, "Labs");
  assert.equal(groups[0].weight, null);
});

test("a weight known from a later source fills in a category's missing weight", () => {
  const groups = groupByCategory([], [{ category: "Tests", weight: null }], [{ category: "Tests", weight: 50 }]);
  assert.equal(groups[0].weight, 50);
});

test("a plain assignment list with no categories has no sections at all beyond the one", () => {
  const groups = groupByCategory([item("A"), item("B")], []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "");
});

/* ---------------------------- course weights ---------------------------- */

test("screenshot weights are added to a course that had none", () => {
  const r = mergeCourseWeights([], [{ category: "Formative", weight: 30 }, { category: "Summative", weight: 70 }]);
  assert.deepEqual(r, [{ category: "Formative", weight: 30 }, { category: "Summative", weight: 70 }]);
});

test("a weight the screenshot shows replaces the course's, keeping the course's spelling", () => {
  const r = mergeCourseWeights([{ category: "tests", weight: 40 }], [{ category: "Tests", weight: 50 }]);
  assert.deepEqual(r, [{ category: "tests", weight: 50 }]);
});

test("categories the screenshot didn't show survive — a partial shot can't wipe the rest", () => {
  const r = mergeCourseWeights(
    [{ category: "Homework", weight: 20 }, { category: "Tests", weight: 80 }],
    [{ category: "Tests", weight: 70 }],
  );
  assert.deepEqual(r, [{ category: "Homework", weight: 20 }, { category: "Tests", weight: 70 }]);
});

test("rows with no usable weight or name are skipped", () => {
  const r = mergeCourseWeights([], [
    { category: "Labs", weight: 0 },
    { category: "  ", weight: 10 },
    { category: "Quizzes", weight: NaN },
  ]);
  assert.deepEqual(r, []);
});

test("merging weights never mutates the course's own list", () => {
  const existing = [{ category: "Tests", weight: 40 }];
  mergeCourseWeights(existing, [{ category: "Tests", weight: 90 }]);
  assert.equal(existing[0].weight, 40);
});

report("screenshot-merge");
