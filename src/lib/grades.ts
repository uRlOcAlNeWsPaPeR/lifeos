// Pure, client-safe grade math. Powers the Grades page and the calculators.
import type { AssignmentDTO, CourseDTO } from "@/lib/types";

/* ----------------------------- letter <-> number ----------------------------- */

export interface LetterScaleEntry {
  /** minimum percent for this letter */
  min: number;
  letter: string;
}

/**
 * Different schools (and different countries) draw the letter/percent lines in
 * different places — "an A is 90+" somewhere else is "an A is 85+", and a UK
 * university doesn't use A-F at all. The student picks one (Grades, first
 * visit, or any time after in Settings → School); everything below just takes
 * whichever scale it's handed and falls back to the U.S. +/- scale by default.
 */
export const GRADE_SCALE_PRESETS: {
  id: string;
  label: string;
  /** Short "cutoffs at a glance" line for the picker. */
  example: string;
  scale: LetterScaleEntry[];
}[] = [
  {
    id: "us-plus-minus",
    label: "U.S. standard (+/-)",
    example: "A 93+ · A- 90+ · B+ 87+ · B 83+ · …",
    scale: [
      { min: 97, letter: "A+" },
      { min: 93, letter: "A" },
      { min: 90, letter: "A-" },
      { min: 87, letter: "B+" },
      { min: 83, letter: "B" },
      { min: 80, letter: "B-" },
      { min: 77, letter: "C+" },
      { min: 73, letter: "C" },
      { min: 70, letter: "C-" },
      { min: 67, letter: "D+" },
      { min: 63, letter: "D" },
      { min: 60, letter: "D-" },
      { min: 0, letter: "F" },
    ],
  },
  {
    id: "us-standard",
    label: "U.S. standard (no +/-)",
    example: "A 90+ · B 80+ · C 70+ · D 60+",
    scale: [
      { min: 90, letter: "A" },
      { min: 80, letter: "B" },
      { min: 70, letter: "C" },
      { min: 60, letter: "D" },
      { min: 0, letter: "F" },
    ],
  },
  {
    id: "scale-85",
    label: "85 scale",
    example: "A 85+ · B 75+ · C 65+ · D 55+",
    scale: [
      { min: 85, letter: "A" },
      { min: 75, letter: "B" },
      { min: 65, letter: "C" },
      { min: 55, letter: "D" },
      { min: 0, letter: "F" },
    ],
  },
  {
    id: "scale-80",
    label: "80 scale",
    example: "A 80+ · B 70+ · C 60+ · D 50+",
    scale: [
      { min: 80, letter: "A" },
      { min: 70, letter: "B" },
      { min: 60, letter: "C" },
      { min: 50, letter: "D" },
      { min: 0, letter: "F" },
    ],
  },
  {
    id: "uk-honours",
    label: "UK honours classification",
    example: "1st 70+ · 2:1 60+ · 2:2 50+ · 3rd 40+",
    scale: [
      { min: 70, letter: "1st" },
      { min: 60, letter: "2:1" },
      { min: 50, letter: "2:2" },
      { min: 40, letter: "3rd" },
      { min: 0, letter: "Fail" },
    ],
  },
];

export const DEFAULT_GRADE_SCALE_ID = GRADE_SCALE_PRESETS[0].id;

/** Backward-compat alias — the default (U.S. +/-) scale on its own. */
export const LETTER_SCALE: LetterScaleEntry[] = GRADE_SCALE_PRESETS[0].scale;

/** What's stored in a student's prefs. `presetId: null` = never chosen yet. */
export interface GradeScalePref {
  presetId: string | null;
  /** Only meaningful when `presetId === "custom"`. */
  custom?: LetterScaleEntry[];
}

export const DEFAULT_GRADE_SCALE_PREF: GradeScalePref = { presetId: null };

/** Turn a stored preference into the actual scale to grade against. */
export function resolveGradeScale(pref: GradeScalePref | null | undefined): LetterScaleEntry[] {
  if (pref?.presetId === "custom" && pref.custom?.length) {
    const rows = pref.custom
      .filter((r) => Number.isFinite(r.min) && r.letter.trim())
      .map((r) => ({ min: r.min, letter: r.letter.trim() }))
      .sort((a, b) => b.min - a.min);
    if (rows.length) {
      // Always have a floor so every percent resolves to something.
      if (rows[rows.length - 1].min > 0) rows.push({ min: 0, letter: "F" });
      return rows;
    }
  }
  return GRADE_SCALE_PRESETS.find((p) => p.id === pref?.presetId)?.scale ?? LETTER_SCALE;
}

export function letterFromPct(
  pct: number | null | undefined,
  scale: LetterScaleEntry[] = LETTER_SCALE,
): string | null {
  if (pct == null || Number.isNaN(pct)) return null;
  return scale.find((s) => pct >= s.min)?.letter ?? scale[scale.length - 1]?.letter ?? "F";
}

/** GPA points for each letter — what a school's unweighted scale is made of. */
export type GpaPoints = Record<string, number>;

/** The common US 4.0 scale: A+ and A are 4.0, minuses drop by 0.3. */
export const DEFAULT_GPA_POINTS: GpaPoints = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

export const GPA_LETTERS = Object.keys(DEFAULT_GPA_POINTS);

/** Ready-made unweighted scales; schools vary, so any can be edited after. */
export const GPA_POINT_PRESETS: { id: string; name: string; note: string; points: GpaPoints }[] = [
  {
    id: "standard",
    name: "Standard 4.0",
    note: "A+ and A = 4.0, A- = 3.7",
    points: DEFAULT_GPA_POINTS,
  },
  {
    id: "plus-minus-4",
    name: "4.0, no minus penalty",
    note: "A- = 4.0, B+ = 3.5 … (each letter is worth its band)",
    points: {
      "A+": 4.0, A: 4.0, "A-": 4.0,
      "B+": 3.5, B: 3.0, "B-": 3.0,
      "C+": 2.5, C: 2.0, "C-": 2.0,
      "D+": 1.5, D: 1.0, "D-": 1.0,
      F: 0.0,
    },
  },
  {
    id: "letters-only",
    name: "Whole letters only",
    note: "+ and - ignored: A = 4, B = 3, C = 2, D = 1",
    points: {
      "A+": 4, A: 4, "A-": 4,
      "B+": 3, B: 3, "B-": 3,
      "C+": 2, C: 2, "C-": 2,
      "D+": 1, D: 1, "D-": 1,
      F: 0,
    },
  },
  {
    id: "four-three",
    name: "4.3 scale",
    note: "A+ = 4.3, A = 4.0, A- = 3.7",
    points: {
      "A+": 4.3, A: 4.0, "A-": 3.7,
      "B+": 3.3, B: 3.0, "B-": 2.7,
      "C+": 2.3, C: 2.0, "C-": 1.7,
      "D+": 1.3, D: 1.0, "D-": 0.7,
      F: 0.0,
    },
  },
];

/** Points for a letter on the given scale; a letter the scale lacks falls back to the standard one. */
export function gpaFromLetter(
  letter: string | null | undefined,
  points: GpaPoints = DEFAULT_GPA_POINTS,
): number | null {
  if (!letter) return null;
  const key = letter.trim().toUpperCase();
  const own = points[key];
  if (typeof own === "number" && Number.isFinite(own)) return own;
  return DEFAULT_GPA_POINTS[key] ?? null;
}

/** Pull a letter out of a free-text grade string like "A- / 91%" or "92%". */
export function parseGradeString(
  raw: string | null | undefined,
  scale: LetterScaleEntry[] = LETTER_SCALE,
): {
  pct: number | null;
  letter: string | null;
} {
  if (!raw) return { pct: null, letter: null };
  const s = raw.trim();
  // "91%" first; otherwise a bare number that reads like a percent ("88", "90.5").
  const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%/) ?? s.match(/^(\d{1,3}(?:\.\d+)?)$/);
  const pctRaw = pctMatch ? Number(pctMatch[1]) : null;
  const pct = pctRaw != null && pctRaw >= 0 && pctRaw <= 150 ? pctRaw : null;
  // Letter, optionally with a +/- suffix. The trailing lookahead keeps the "-"
  // in "A-" (a plain \b would drop it, since "-" isn't a word char).
  const letterMatch = s.match(/\b([A-DF][+-]?)(?![A-Za-z0-9])/i);
  const letter = letterMatch ? letterMatch[1].toUpperCase() : null;
  return { pct, letter: letter ?? letterFromPct(pct, scale) };
}

/* ------------------------------- formatting -------------------------------- */

/** Trim a trailing ".0" so 20 renders "20" and 18.5 renders "18.5". */
export function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 10) / 10}%`;
}

export function fmtPoints(earned: number | null, possible: number | null): string | null {
  if (earned == null && possible == null) return null;
  if (earned == null) return `–/${num(possible!)}`;
  if (possible == null) return num(earned);
  return `${num(earned)}/${num(possible)}`;
}

/** "18/20 · 90%" for the assignment row — falls back to a manual grade string. */
export function assignmentGradeLabel(
  a: Pick<AssignmentDTO, "pointsEarned" | "pointsPossible" | "gradeValue">,
): string | null {
  const pts = fmtPoints(a.pointsEarned, a.pointsPossible);
  if (pts && a.pointsEarned != null && a.pointsPossible && a.pointsPossible > 0) {
    const pct = Math.round((a.pointsEarned / a.pointsPossible) * 1000) / 10;
    return `${pts} · ${pct}%`;
  }
  if (pts) return pts;
  return a.gradeValue ?? null;
}

/* --------------------------- points-based grade --------------------------- */

export interface PointsRow {
  earned: number;
  possible: number;
}

/** Sum earned / sum possible → percent. Ignores rows with 0 possible points. */
export function pointsPct(rows: PointsRow[]): number | null {
  let e = 0;
  let p = 0;
  for (const r of rows) {
    if (!(r.possible > 0)) continue;
    e += r.earned;
    p += r.possible;
  }
  if (p <= 0) return null;
  return Math.round((e / p) * 1000) / 10;
}

/** Exact points in a set of assignments: total earned out of total possible. */
export interface PointsTotal {
  earned: number;
  possible: number;
  /** earned / possible, to two decimals. null when nothing graded has points. */
  pct: number | null;
  /** Graded work recorded only as a letter or percent, so not in the totals. */
  letterOnly: number;
}

/**
 * Add up every graded assignment's points: the category's real running total
 * (e.g. 47 / 52), not an average of per-assignment percents.
 */
export function pointsTotal(assignments: AssignmentDTO[]): PointsTotal {
  let earned = 0;
  let possible = 0;
  let letterOnly = 0;
  for (const a of assignments) {
    if (a.status !== "graded") continue;
    if (a.pointsEarned != null && a.pointsPossible != null && a.pointsPossible > 0) {
      earned += a.pointsEarned;
      possible += a.pointsPossible;
    } else if (a.gradeValue) {
      letterOnly++;
    }
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    earned: round2(earned),
    possible: round2(possible),
    pct: possible > 0 ? round2((earned / possible) * 100) : null,
    letterOnly,
  };
}

/* --------------------------- weighted categories -------------------------- */

export interface WeightRow {
  /** category weight as a percent of the final grade, e.g. 40 */
  weight: number;
  /** your average in that category as a percent, e.g. 88 */
  score: number;
}

/**
 * Weighted average across categories. If the weights don't sum to 100 we
 * normalise by the weight actually entered, so a partial term still reads right.
 */
export function weightedPct(rows: WeightRow[]): { pct: number | null; totalWeight: number } {
  let weighted = 0;
  let totalWeight = 0;
  for (const r of rows) {
    if (!(r.weight > 0)) continue;
    weighted += (r.weight / 100) * r.score;
    totalWeight += r.weight;
  }
  if (totalWeight <= 0) return { pct: null, totalWeight: 0 };
  return { pct: Math.round((weighted / (totalWeight / 100)) * 10) / 10, totalWeight };
}

/* --------------------------- "need on the final" ------------------------- */

/**
 * Score needed on a final (or any remaining component) to hit `target`.
 *   target = current·(1 − w) + final·w   →   final = (target − current·(1 − w)) / w
 * `weight` is the final's share of the grade, as a percent.
 */
export function neededOnFinal(current: number, weight: number, target: number) {
  const w = weight / 100;
  if (w <= 0) return { needed: null as number | null, maxPossible: current, minPossible: current };
  const needed = (target - current * (1 - w)) / w;
  return {
    needed: Math.round(needed * 10) / 10,
    maxPossible: Math.round((current * (1 - w) + 100 * w) * 10) / 10,
    minPossible: Math.round(current * (1 - w) * 10) / 10,
  };
}

/* ----------------------------- course summary ---------------------------- */

export type GradeSource = "canvas" | "weighted" | "computed" | "manual";

export interface CourseGrade {
  source: GradeSource | null;
  pct: number | null;
  letter: string | null;
  earned: number | null;
  possible: number | null;
  gradedCount: number;
}

/** Graded assignments that carry real point values. */
export function gradedWithPoints(course: CourseDTO): AssignmentDTO[] {
  return course.assignments.filter(
    (a) => a.status === "graded" && a.pointsEarned != null && a.pointsPossible != null && a.pointsPossible > 0,
  );
}

/**
 * A graded assignment's percent, real points first — otherwise a manually
 * typed-in grade ("A-", "95%") on a assignment with no points, treated as a
 * single 0–100 point row so it still counts toward its category's average.
 */
function assignmentPct(a: AssignmentDTO): PointsRow | null {
  if (a.pointsEarned != null && a.pointsPossible != null && a.pointsPossible > 0) {
    return { earned: a.pointsEarned, possible: a.pointsPossible };
  }
  const pct = parseGradeString(a.gradeValue).pct;
  return pct != null ? { earned: pct, possible: 100 } : null;
}

/** A category's (or any assignment group's) average percent from its graded work. */
export function categoryPct(assignments: AssignmentDTO[]): number | null {
  return pointsPct(
    assignments
      .filter((a) => a.status === "graded")
      .map(assignmentPct)
      .filter((r): r is PointsRow => r !== null),
  );
}

/**
 * The single grade to show for a course. Canvas's own computed score wins (it
 * knows the real weighting) unless the course carries the student's own
 * category weights and Canvas isn't weighting it; with declared categories we
 * weight each category's average by its share; otherwise we compute a flat points average
 * from graded assignments; otherwise fall back to whatever the student typed
 * in. `scale` is whichever percent→letter cutoffs the student picked
 * (Settings → School); defaults to the U.S. +/- scale when they haven't chosen one.
 */
export function courseGrade(course: CourseDTO, scale: LetterScaleEntry[] = LETTER_SCALE): CourseGrade {
  const graded = gradedWithPoints(course);
  const earned = graded.reduce((n, a) => n + (a.pointsEarned ?? 0), 0);
  const possible = graded.reduce((n, a) => n + (a.pointsPossible ?? 0), 0);

  const canvasResult = (): CourseGrade | null =>
    course.currentScore == null
      ? null
      : {
          source: "canvas",
          pct: course.currentScore,
          letter:
            parseGradeString(course.currentGrade, scale).letter ??
            letterFromPct(course.currentScore, scale),
          earned: graded.length ? earned : null,
          possible: graded.length ? possible : null,
          gradedCount: graded.length,
        };

  // The student's own category weights beat Canvas's score only when Canvas
  // itself isn't weighting the class (their real gradebook lives elsewhere).
  const ownWeights = Boolean(course.gradeWeights?.length) && course.canvasWeighted === false;
  if (course.currentScore != null && !ownWeights) return canvasResult()!;

  if (course.gradeWeights?.length) {
    const rows: WeightRow[] = course.gradeWeights
      .map((w): WeightRow | null => {
        const inCategory = course.assignments.filter((a) => (a.category ?? "") === w.category);
        const pct = categoryPct(inCategory);
        return pct != null ? { weight: w.weight, score: pct } : null;
      })
      .filter((r): r is WeightRow => r !== null);
    // Only once at least one category has graded work — an all-empty course
    // falls through to the plain "nothing graded yet" result below.
    if (rows.length) {
      const { pct } = weightedPct(rows);
      if (pct != null) {
        return { source: "weighted", pct, letter: letterFromPct(pct, scale), earned, possible, gradedCount: graded.length };
      }
    }
  }

  // Weights that matched no graded work: Canvas's own score is still better
  // than a flat points average.
  const canvas = canvasResult();
  if (canvas) return canvas;

  if (graded.length && possible > 0) {
    const pct = Math.round((earned / possible) * 1000) / 10;
    return { source: "computed", pct, letter: letterFromPct(pct, scale), earned, possible, gradedCount: graded.length };
  }

  const parsed = parseGradeString(course.currentGrade, scale);
  if (parsed.pct != null || parsed.letter) {
    return {
      source: "manual",
      pct: parsed.pct,
      letter: parsed.letter,
      earned: null,
      possible: null,
      gradedCount: 0,
    };
  }

  return { source: null, pct: null, letter: null, earned: null, possible: null, gradedCount: 0 };
}

/** Mean GPA across courses that have a resolvable letter grade. */
/**
 * How much a course level adds on top of the normal 4.0 letter points — the
 * usual US convention, where an A is 4.0 in a regular class and 5.0 in an AP.
 * Schools differ, so these are only defaults a student can edit.
 */
export interface GpaLevel {
  /** Stored on the course; renaming a level keeps its courses attached. */
  id: string;
  name: string;
  bonus: number;
}

export const DEFAULT_GPA_LEVELS: GpaLevel[] = [
  { id: "regular", name: "Regular", bonus: 0 },
  { id: "honors", name: "Honors", bonus: 0.5 },
  { id: "ap", name: "AP / IB", bonus: 1 },
];

export const REGULAR_LEVEL_ID = "regular";

export function findGpaLevel(levels: GpaLevel[], id: string | null | undefined): GpaLevel | null {
  if (!id) return null;
  return levels.find((l) => l.id === id) ?? null;
}

/** One class's share of the GPA: its letter and what it's worth. */
export interface GpaClassPoints {
  courseId: string;
  name: string;
  letter: string;
  /** Points on the student's unweighted scale. */
  points: number;
  /** Level bonus added for the weighted GPA (0 for regular or a failing grade). */
  bonus: number;
}

export interface GpaEstimate {
  /** The plain 4.0-scale average — every class counted the same. */
  unweighted: number | null;
  /** The same average with each course's level bonus added. */
  weighted: number | null;
  counted: number;
  /** Every class that counted, so the page can show the sum it averaged. */
  classes: GpaClassPoints[];
}

/**
 * Both GPAs in one pass, so a student can switch between them without the
 * numbers disagreeing. A course with no level set counts as regular.
 *
 * The bonus only applies to a passing grade: failing an AP earns 0.0, not the
 * bonus, which is how schools award weighted credit.
 */
export function estimateGpa(
  courses: CourseDTO[],
  scale: LetterScaleEntry[] = LETTER_SCALE,
  levels: GpaLevel[] = DEFAULT_GPA_LEVELS,
  points: GpaPoints = DEFAULT_GPA_POINTS,
): GpaEstimate {
  // (class 1 + class 2 + … + class n) / n, over every class with a grade.
  const classes: GpaClassPoints[] = [];
  for (const c of courses) {
    const g = courseGrade(c, scale);
    const p = gpaFromLetter(g.letter, points);
    if (p == null || !g.letter) continue;
    const bonus = p > 0 ? (findGpaLevel(levels, c.gpaLevel)?.bonus ?? 0) : 0;
    classes.push({ courseId: c.id, name: c.name, letter: g.letter, points: p, bonus });
  }
  if (!classes.length) return { unweighted: null, weighted: null, counted: 0, classes };
  const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
  return {
    unweighted: mean(classes.map((c) => c.points)),
    weighted: mean(classes.map((c) => c.points + c.bonus)),
    counted: classes.length,
    classes,
  };
}
