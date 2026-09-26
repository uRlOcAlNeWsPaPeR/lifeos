// Combining several screenshots of one gradebook or assignment list into a
// single review.
//
// A long Canvas page doesn't fit in one screenshot, so a student takes two or
// three that overlap at the seams. Reading them one after another means the
// same assignment can turn up twice, and a category row can be visible in one
// shot and cut off in the next. These helpers stitch the reads together without
// ever overwriting something the student has already edited.

export interface ScreenshotDraft {
  title: string;
  dueAt: string;
  notes: string;
  pointsPossible: string;
  pointsEarned: string;
  gradeValue: string;
  category: string;
  keep: boolean;
}

export interface WeightRow {
  category: string;
  weight: string;
}

/** A title reduced to what identifies it: case, spacing and punctuation don't. */
export const titleKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Whether two drafts are the same assignment read twice.
 *
 * Same title on two different dates is a recurring assignment ("Weekly
 * reflection"), not a repeat, so both are kept. A missing date on either side
 * is treated as compatible — an overlapping screenshot may crop the date off.
 */
function sameAssignment(a: ScreenshotDraft, b: ScreenshotDraft): boolean {
  const ka = titleKey(a.title);
  if (!ka || ka !== titleKey(b.title)) return false;
  return !a.dueAt || !b.dueAt || a.dueAt === b.dueAt;
}

/** The fields a repeat read may fill in when the first read left them blank. */
const FILLABLE = ["dueAt", "notes", "pointsPossible", "pointsEarned", "gradeValue", "category"] as const;

export interface MergeResult {
  items: ScreenshotDraft[];
  /** Newly added. */
  added: number;
  /** Repeats folded into an item already in the list. */
  merged: number;
}

/**
 * Add a new screenshot's items to the ones already reviewed.
 *
 * Existing items always win: a repeat only fills fields that are still blank
 * (a score visible in the second shot but not the first), and never changes a
 * title, a value the student typed, or whether they've kept or dropped the row.
 * New items are appended in the order the screenshot showed them.
 */
export function mergeItems(existing: ScreenshotDraft[], incoming: ScreenshotDraft[]): MergeResult {
  const items = existing.map((x) => ({ ...x }));
  let added = 0;
  let merged = 0;
  for (const inc of incoming) {
    const hit = items.find((x) => sameAssignment(x, inc));
    if (hit) {
      for (const f of FILLABLE) if (!hit[f] && inc[f]) hit[f] = inc[f];
      merged++;
    } else {
      items.push({ ...inc });
      added++;
    }
  }
  return { items, added, merged };
}

/**
 * Combine weight tables. Categories match case-insensitively; a weight already
 * in the list is kept, and only filled in where it was blank. Categories the
 * first screenshot didn't show are appended.
 */
export function mergeWeights(existing: WeightRow[], incoming: WeightRow[]): WeightRow[] {
  const out = existing.map((x) => ({ ...x }));
  for (const inc of incoming) {
    const name = inc.category.trim();
    if (!name) continue;
    const hit = out.find((x) => x.category.trim().toLowerCase() === name.toLowerCase());
    if (hit) {
      if (!hit.weight.trim() && inc.weight.trim()) hit.weight = inc.weight;
    } else {
      out.push({ category: name, weight: inc.weight });
    }
  }
  return out;
}

/**
 * Resolve a category label to the spelling already in use, so "formative" from
 * the second screenshot lands in the same bucket as "Formative" from the first.
 * An unknown label is kept as read; no label is an empty string.
 */
export function canonicalCategory(raw: string | null | undefined, known: string[]): string {
  const name = raw?.trim();
  if (!name) return "";
  return known.find((k) => k.trim().toLowerCase() === name.toLowerCase())?.trim() ?? name;
}

/* -------------------------------------------------------------------------- *
 * Organizing by category
 * -------------------------------------------------------------------------- */

export interface CategoryGroup {
  /** Lower-cased category name — "" for items with no category. */
  key: string;
  label: string;
  /** Percent of the grade, or null when none is known for this category. */
  weight: number | null;
  /** Items in the order the screenshots showed them, with their index in the full list. */
  entries: { item: ScreenshotDraft; index: number }[];
}

/**
 * Arrange reviewed items the way the gradebook screenshot lays them out: one
 * section per category, in the order the screenshot listed them, each carrying
 * its weight, with the assignments beneath in the order they appeared.
 *
 * Order of sections:
 *  1. the categories read off the screenshot (its own order),
 *  2. then any the course already declared that the screenshot didn't show,
 *  3. then any category an item is tagged with but nothing gave a weight,
 *  4. and "No category" last, only if something is in it.
 *
 * A category with no items still gets its section — a gradebook lists an empty
 * "Labs 30%" row, and seeing it is how the student knows it wasn't missed.
 * Matching is case-insensitive, so "formative" and "Formative" are one group.
 */
export function groupByCategory(
  items: ScreenshotDraft[],
  fromScreenshot: { category: string; weight: number | null }[],
  declared: { category: string; weight: number }[] = [],
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const byKey = new Map<string, CategoryGroup>();
  const add = (name: string, weight: number | null) => {
    const label = name.trim();
    const key = label.toLowerCase();
    if (!key) return;
    const have = byKey.get(key);
    if (have) {
      // Keep the first spelling, but pick up a weight a later source knows.
      if (have.weight == null && weight != null) have.weight = weight;
      return;
    }
    const g: CategoryGroup = { key, label, weight, entries: [] };
    byKey.set(key, g);
    groups.push(g);
  };

  for (const c of fromScreenshot) add(c.category, c.weight);
  for (const w of declared) add(w.category, w.weight);
  for (const it of items) add(it.category, null);

  const none: CategoryGroup = { key: "", label: "No category", weight: null, entries: [] };
  items.forEach((item, index) => {
    const key = item.category.trim().toLowerCase();
    (byKey.get(key) ?? none).entries.push({ item, index });
  });
  return none.entries.length ? [...groups, none] : groups;
}

/**
 * Fold weights read from a screenshot into the course's existing weights.
 *
 * The screenshot wins on a weight it shows (the student has just checked it
 * against their gradebook), and a category the course already had keeps its
 * own spelling. Categories the screenshot didn't show are left alone, so a
 * partial screenshot can't wipe out weights entered earlier. Rows without a
 * usable weight are skipped — there's nothing to save for them yet.
 */
export function mergeCourseWeights(
  existing: { category: string; weight: number }[],
  incoming: { category: string; weight: number }[],
): { category: string; weight: number }[] {
  const out = existing.map((w) => ({ ...w }));
  for (const inc of incoming) {
    const name = inc.category.trim();
    if (!name || !(inc.weight > 0)) continue;
    const hit = out.find((w) => w.category.trim().toLowerCase() === name.toLowerCase());
    if (hit) hit.weight = inc.weight;
    else out.push({ category: name, weight: inc.weight });
  }
  return out;
}
