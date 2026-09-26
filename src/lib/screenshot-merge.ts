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
