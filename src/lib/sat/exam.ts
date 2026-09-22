// Full-length adaptive practice exams, ported from ScoreClimb unchanged.
//
// Four modules — two Reading & Writing, a break, two Math. Module 1 of each
// section is balanced; module 2 adapts to how module 1 went. Library exams are
// seeded, so exam N always draws the same questions and can be retaken and
// compared. Pure functions over the persisted `ExamState`.

import {
  EXAM_SPECS,
  HARD_ROUTE_CUTOFF,
  MODULE_MIX,
} from "./constants";
import { isCorrect } from "./engine";
import type {
  CatalogRow,
  Difficulty,
  ExamModule,
  ExamState,
  ModuleRoute,
  Question,
  Section,
  StatBucket,
  TestKind,
} from "./types";

export function newExam(kind: TestKind, lib: number | null, now: Date = new Date()): ExamState {
  return {
    kind,
    lib,
    seed: lib ? lib * 7919 + (kind === "psat" ? 101 : 13) : null,
    startedISO: now.toISOString(),
    phase: "module",
    cur: 0,
    used: [],
    modules: [],
    breakLeft: EXAM_SPECS[kind].breakMinutes * 60,
  };
}

/**
 * Draw one module from the test's own pool (SAT exams use the SAT pool, PSAT
 * the PSAT pool), at the route's difficulty mix, never repeating a question
 * already used in this exam, ordered easy → hard like the real test.
 *
 * Seeded exams use mulberry32 so the same exam number reproduces exactly.
 * Mutates `ex.used` and returns the module; the caller appends it.
 */
export function buildModule(
  ex: ExamState,
  sectionKey: Section,
  route: ModuleRoute,
  rows: CatalogRow[],
  random: () => number = Math.random,
): ExamModule {
  const secSpec = EXAM_SPECS[ex.kind].sections.find((s) => s.key === sectionKey)!;
  const count = secSpec.perModule;
  const used = new Set(ex.used);

  let seed = ex.seed != null ? (ex.seed + ex.modules.length * 104729) >>> 0 : null;
  const rnd = () => {
    if (seed == null) return random();
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pool: Record<Difficulty, CatalogRow[]> = { E: [], M: [], H: [] };
  for (const r of rows) {
    if (!used.has(r.key) && pool[r.difficulty]) pool[r.difficulty].push(r);
  }
  for (const d of ["E", "M", "H"] as const) shuffle(pool[d]);

  const mix = MODULE_MIX[route];
  const want: Record<Difficulty, number> = {
    E: Math.round(count * mix.E),
    M: Math.round(count * mix.M),
    H: 0,
  };
  want.H = count - want.E - want.M;

  const picked: CatalogRow[] = [];
  for (const d of ["E", "M", "H"] as const) picked.push(...pool[d].splice(0, want[d]));
  // Top up from whatever remains if a difficulty bucket ran dry.
  const leftovers = shuffle([...pool.E, ...pool.M, ...pool.H]);
  while (picked.length < count && leftovers.length) picked.push(leftovers.shift()!);

  const rank: Record<Difficulty, number> = { E: 0, M: 1, H: 2 };
  picked.sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);

  for (const r of picked) ex.used.push(r.key);
  return {
    section: sectionKey,
    route,
    qids: picked.map((r) => r.key),
    total: picked.length,
    answers: {},
    flagged: {},
    crossed: {},
    timeLeft: secSpec.minutes * 60,
    at: 0,
    submitted: false,
    correct: null,
    warned: false,
  };
}

/** Count correct answers in a module. Unloadable questions score as wrong. */
export function gradeModule(mod: ExamModule, getQ: (id: string) => Question | undefined): number {
  let correct = 0;
  for (const id of mod.qids) {
    const q = getQ(id);
    if (!q) continue;
    if (isCorrect(q, mod.answers[id])) correct++;
  }
  mod.correct = correct;
  return correct;
}

/** Module 2's route, from module 1's accuracy. */
export const routeFor = (mod: ExamModule): ModuleRoute =>
  (mod.correct ?? 0) / mod.total >= HARD_ROUTE_CUTOFF ? "hard" : "easy";

/**
 * Scaled section score. The harder route earns a small bonus; the easier route
 * caps the ceiling — the same trade-off the real adaptive test makes.
 */
export function scoreSection(kind: TestKind, m1: ExamModule, m2: ExamModule): number {
  const { min, max } = EXAM_SPECS[kind].scale;
  const span = max - min;
  const total = m1.total + m2.total;
  let scaled = min + span * (((m1.correct ?? 0) + (m2.correct ?? 0)) / total);
  if (m2.route === "hard") scaled += 20;
  if (m2.route === "easy") scaled = Math.min(scaled, min + span * 0.72);
  return Math.round(Math.max(min, Math.min(max, scaled)) / 10) * 10;
}

export interface ExamResult {
  kind: TestKind;
  date: string;
  rw: number;
  math: number;
  total: number;
  lib: number | null;
  modules: {
    section: Section;
    route: ModuleRoute;
    correct: number;
    total: number;
    review: { id: string; given: string | undefined }[];
  }[];
  examDomains: Record<Section, Record<string, StatBucket>>;
}

/**
 * Score a finished exam and build its review: every missed or skipped question
 * per module, plus this exam's own domain breakdown.
 */
export function scoreExam(
  ex: ExamState,
  getQ: (id: string) => Question | undefined,
  date: string,
): ExamResult {
  const rw = scoreSection(ex.kind, ex.modules[0], ex.modules[1]);
  const math = scoreSection(ex.kind, ex.modules[2], ex.modules[3]);

  const examDomains: ExamResult["examDomains"] = { rw: {}, math: {} };
  for (const m of ex.modules) {
    for (const id of m.qids) {
      if (m.answers[id] === undefined) continue;
      const q = getQ(id);
      if (!q) continue;
      const bucket = examDomains[q.section];
      const d = bucket[q.domain] ?? (bucket[q.domain] = { desc: q.domainDesc, section: q.section, attempts: 0, correct: 0 });
      d.attempts++;
      if (isCorrect(q, m.answers[id])) d.correct++;
    }
  }

  return {
    kind: ex.kind,
    date,
    rw,
    math,
    total: rw + math,
    lib: ex.lib ?? null,
    modules: ex.modules.map((m) => ({
      section: m.section,
      route: m.route,
      correct: m.correct ?? 0,
      total: m.total,
      review: m.qids
        .filter((id) => {
          const q = getQ(id);
          const a = m.answers[id];
          return a === undefined || !q || !isCorrect(q, a);
        })
        .map((id) => ({ id, given: m.answers[id] })),
    })),
    examDomains,
  };
}

export function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Module label — "Reading & Writing · Module 2 of 2". */
export function moduleLabel(ex: ExamState): string {
  const mod = ex.modules[ex.cur];
  const sec = EXAM_SPECS[ex.kind].sections.find((s) => s.key === mod.section)!;
  return `${sec.name} · Module ${(ex.cur % 2) + 1} of 2`;
}
