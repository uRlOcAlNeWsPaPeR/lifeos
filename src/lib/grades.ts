// Pure, client-safe grade math. Powers the Grades page and the calculators.
import type { AssignmentDTO, CourseDTO } from "@/lib/types";

/* ----------------------------- letter <-> number ----------------------------- */

/** Standard +/- scale. Each entry is the *minimum* percent for that letter. */
export const LETTER_SCALE: { min: number; letter: string }[] = [
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
];

export function letterFromPct(pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(pct)) return null;
  return LETTER_SCALE.find((s) => pct >= s.min)?.letter ?? "F";
}

/** Unweighted 4.0 GPA points for a letter grade. */
const GPA_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

export const GPA_LETTERS = Object.keys(GPA_POINTS);

export function gpaFromLetter(letter: string | null | undefined): number | null {
  if (!letter) return null;
  return GPA_POINTS[letter.trim().toUpperCase()] ?? null;
}

/** Pull a letter out of a free-text grade string like "A- / 91%" or "92%". */
export function parseGradeString(raw: string | null | undefined): {
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
  return { pct, letter: letter ?? letterFromPct(pct) };
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

export type GradeSource = "canvas" | "computed" | "manual";

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
 * The single grade to show for a course. Canvas's own computed score wins (it
 * knows the real weighting); otherwise we compute from graded assignments;
 * otherwise fall back to whatever the student typed in.
 */
export function courseGrade(course: CourseDTO): CourseGrade {
  const graded = gradedWithPoints(course);
  const earned = graded.reduce((n, a) => n + (a.pointsEarned ?? 0), 0);
  const possible = graded.reduce((n, a) => n + (a.pointsPossible ?? 0), 0);

  if (course.currentScore != null) {
    return {
      source: "canvas",
      pct: course.currentScore,
      letter: parseGradeString(course.currentGrade).letter ?? letterFromPct(course.currentScore),
      earned: graded.length ? earned : null,
      possible: graded.length ? possible : null,
      gradedCount: graded.length,
    };
  }

  if (graded.length && possible > 0) {
    const pct = Math.round((earned / possible) * 1000) / 10;
    return { source: "computed", pct, letter: letterFromPct(pct), earned, possible, gradedCount: graded.length };
  }

  const parsed = parseGradeString(course.currentGrade);
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
export function estimateGpa(courses: CourseDTO[]): { gpa: number | null; counted: number } {
  const points: number[] = [];
  for (const c of courses) {
    const g = courseGrade(c);
    const p = gpaFromLetter(g.letter);
    if (p != null) points.push(p);
  }
  if (!points.length) return { gpa: null, counted: 0 };
  return {
    gpa: Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100) / 100,
    counted: points.length,
  };
}
