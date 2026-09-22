// SAT Prep (ported from ScoreClimb). Shapes mirror ScoreClimb's own storage
// exactly — the `scoreclimb` localStorage document and its backup files — so a
// student can restore a backup taken on the standalone site and carry on.

export type Section = "rw" | "math";
export type TestKind = "sat" | "psat";
export type Difficulty = "E" | "M" | "H";
export type ModuleRoute = "base" | "easy" | "hard";

/** One College Board question, as served from `data/q/{key}.json`. */
export interface Question {
  id: string;
  section: Section;
  domain: string;
  domainDesc: string;
  skill: string;
  skillDesc: string;
  difficulty: Difficulty;
  type: "mcq" | "spr";
  stem: string;
  stimulus: string;
  rationale?: string;
  options: string[];
  correct: string[];
  /** The 8-character ID shown on the College Board site, when present. */
  qid?: string;
}

/** A catalog entry — every question, in the College Board site's own order. */
export interface CatalogRow {
  qid: string;
  key: string;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  section: Section;
  skillDesc: string;
}

/** `[qid, key, domain, skill, difficulty]` — the compact on-disk catalog row. */
export type RawCatalogRow = [string, string, string, string, Difficulty];

export interface Catalog {
  sat: Record<Section, RawCatalogRow[]>;
  psat: Record<Section, RawCatalogRow[]>;
  skills: Record<string, string>;
}

export interface TestTrack {
  testDate: string | null;
  targetScore: number;
  prevScore: number | null;
}

export interface Profile {
  name: string;
  tests: Record<TestKind, TestTrack>;
  dailyGoal: number;
}

export interface StatBucket {
  desc: string;
  section: Section;
  attempts: number;
  correct: number;
}

export interface SectionStat {
  att: number;
  corr: number;
  /** Difficulty-weighted totals, which drive the score estimate. */
  wsum: number;
  wcorr: number;
}

export interface ExamModule {
  section: Section;
  route: ModuleRoute;
  qids: string[];
  total: number;
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  crossed: Record<string, Record<string, boolean>>;
  timeLeft: number;
  at: number;
  submitted: boolean;
  correct: number | null;
  warned: boolean;
}

export interface ExamState {
  kind: TestKind;
  /** Library exam number — a fixed, reproducible question set. */
  lib: number | null;
  seed: number | null;
  startedISO: string;
  phase: "module" | "break" | "done";
  cur: number;
  used: string[];
  modules: ExamModule[];
  breakLeft: number;
}

export interface ExamHistoryEntry {
  kind: TestKind;
  date: string;
  rw: number;
  math: number;
  total: number;
  lib: number | null;
}

export interface ExternalExam {
  date: string;
  source: string;
  rw: number;
  math: number;
  total: number;
}

export interface PausedQuiz {
  name: string;
  startedISO: string;
  qids: string[];
  idx: number;
  session: { correct: number; xp: number; section: string };
}

export interface SatState {
  profile: Profile | null;
  /** Kept for backup compatibility; LifeOS has one theme. */
  theme: string;
  lastRoute: { route: string; arg: string | null } | null;
  pausedQuiz: PausedQuiz | null;
  xp: number;
  streak: { current: number; best: number; lastDay: string | null };
  history: Record<string, { answered: number; correct: number }>;
  skills: Record<string, StatBucket>;
  domains: Record<string, StatBucket>;
  sectionStats: Record<Section, SectionStat>;
  seen: Record<string, boolean>;
  missed: string[];
  missedAnswers: Record<string, string | undefined>;
  badges: string[];
  counters: { answered: number; inARow: number; hardCorrect: number };
  exam: ExamState | null;
  examHistory: ExamHistoryEntry[];
  flash: Record<string, { box: number }>;
  study: Record<string, number>;
  external: ExternalExam[];
  qotd: { date: string; picks: Partial<Record<Section, string>> } | null;
}

export interface Guide {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  sections: { t: string; html: string }[];
}
