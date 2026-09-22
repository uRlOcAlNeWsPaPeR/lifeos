// Reference data for SAT Prep, carried over from ScoreClimb unchanged: the
// College Board domain and skill taxonomy, the scoring scales, the adaptive
// module mix and the badge list. Changing any number here changes scores.

import type { Difficulty, ModuleRoute, Section, TestKind } from "./types";

export const DOMAINS: Record<Section, { code: string; name: string }[]> = {
  rw: [
    { code: "INI", name: "Information and Ideas" },
    { code: "CAS", name: "Craft and Structure" },
    { code: "EOI", name: "Expression of Ideas" },
    { code: "SEC", name: "Standard English Conventions" },
  ],
  math: [
    { code: "H", name: "Algebra" },
    { code: "P", name: "Advanced Math" },
    { code: "Q", name: "Problem-Solving and Data Analysis" },
    { code: "S", name: "Geometry and Trigonometry" },
  ],
};

/** The exact skill order College Board uses on its own site, domain by domain. */
export const SKILL_ORDER = [
  "CID", "INF", "COE", "WIC", "TSP", "CTC", "SYN", "TRA", "BOU", "FSS",
  "H.A.", "H.B.", "H.C.", "H.D.", "H.E.", "P.C.", "P.B.", "P.A.",
  "Q.A.", "Q.B.", "Q.C.", "Q.D.", "Q.E.", "Q.F.", "Q.G.", "S.A.", "S.B.", "S.C.", "S.D.",
];

export const DIFF_XP: Record<Difficulty, number> = { E: 10, M: 12, H: 15 };
export const DIFF_WEIGHT: Record<Difficulty, number> = { E: 0.9, M: 1.0, H: 1.2 };
export const DIFF_NAME: Record<Difficulty, string> = { E: "Easy", M: "Medium", H: "Hard" };

export const SECTION_NAME: Record<Section, string> = { rw: "Reading & Writing", math: "Math" };

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
}

export const BADGES: BadgeDef[] = [
  { id: "first", name: "First Steps", desc: "Complete your first session" },
  { id: "streak3", name: "On Fire", desc: "Hit a 3-day streak" },
  { id: "streak7", name: "Unstoppable", desc: "Hit a 7-day streak" },
  { id: "streak30", name: "Iron Will", desc: "Hit a 30-day streak" },
  { id: "sharp", name: "Sharpshooter", desc: "10 correct in a row" },
  { id: "century", name: "Century Club", desc: "Answer 100 questions" },
  { id: "mathwhiz", name: "Math Whiz", desc: "90%+ on a 10-question math set" },
  { id: "wordsmith", name: "Wordsmith", desc: "90%+ on a 10-question R&W set" },
  { id: "hardcore", name: "Hard Mode", desc: "Get 15 hard questions right" },
  { id: "marathon", name: "Marathoner", desc: "Finish a full practice exam" },
];

/** Upcoming digital SAT administrations (approximate official dates). */
export const SAT_DATES = ["2026-08-29", "2026-10-03", "2026-11-07", "2026-12-05", "2027-03-13"];
/** Upcoming PSAT/NMSQT administrations (approximate — schools set exact dates). */
export const PSAT_DATES = ["2026-10-14", "2026-10-28", "2027-10-13"];

export interface SectionSpec {
  key: Section;
  name: string;
  perModule: number;
  minutes: number;
}

export interface ExamSpec {
  label: string;
  shortLabel: string;
  scale: { min: number; max: number };
  sections: SectionSpec[];
  breakMinutes: number;
}

export const EXAM_SPECS: Record<TestKind, ExamSpec> = {
  sat: {
    label: "SAT",
    shortLabel: "SAT",
    scale: { min: 200, max: 800 },
    sections: [
      { key: "rw", name: "Reading & Writing", perModule: 27, minutes: 32 },
      { key: "math", name: "Math", perModule: 22, minutes: 35 },
    ],
    breakMinutes: 10,
  },
  psat: {
    label: "PSAT / NMSQT",
    shortLabel: "PSAT",
    scale: { min: 160, max: 760 },
    sections: [
      { key: "rw", name: "Reading & Writing", perModule: 27, minutes: 32 },
      { key: "math", name: "Math", perModule: 22, minutes: 35 },
    ],
    breakMinutes: 10,
  },
};

/** Difficulty mix per module: module 1 is balanced, module 2 adapts. */
export const MODULE_MIX: Record<ModuleRoute, Record<Difficulty, number>> = {
  base: { E: 0.3, M: 0.4, H: 0.3 },
  easy: { E: 0.5, M: 0.4, H: 0.1 },
  hard: { E: 0.1, M: 0.4, H: 0.5 },
};

/** Scoring at least 60% on module 1 routes to the harder module 2. */
export const HARD_ROUTE_CUTOFF = 0.6;

/** Numbered, reproducible exams in the library, per test. */
export const LIBRARY_COUNT = 10;

export const DESMOS_URL = "https://www.desmos.com/testing/collegeboard/graphing";

export const COLLEGE_BOARD_BANK_URL =
  "https://satsuiteeducatorquestionbank.collegeboard.org/digital/search";

/** Minimum attempts before a domain can be called a strength or focus area. */
export const MIN_DOMAIN_ATTEMPTS_FOR_LABEL = 3;
