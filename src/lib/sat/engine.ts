// SAT Prep's rules, ported from ScoreClimb with the behaviour unchanged: XP,
// streaks, badges, answer checking, the score estimate and the strengths
// breakdown. Everything here is pure (state in, state mutated or value out) so
// it runs identically in the browser and in tests.

import {
  BADGES,
  DIFF_WEIGHT,
  DIFF_XP,
  DOMAINS,
  EXAM_SPECS,
  MIN_DOMAIN_ATTEMPTS_FOR_LABEL,
  type BadgeDef,
} from "./constants";
import type { CatalogRow, Question, SatState, Section, TestKind } from "./types";

/* --------------------------------- state --------------------------------- */

export const STORAGE_KEY = "scoreclimb";

export const defaultState = (): SatState => ({
  profile: null,
  theme: "auto",
  lastRoute: null,
  pausedQuiz: null,
  xp: 0,
  streak: { current: 0, best: 0, lastDay: null },
  history: {},
  skills: {},
  domains: {},
  sectionStats: {
    rw: { att: 0, corr: 0, wsum: 0, wcorr: 0 },
    math: { att: 0, corr: 0, wsum: 0, wcorr: 0 },
  },
  seen: {},
  missed: [],
  missedAnswers: {},
  badges: [],
  counters: { answered: 0, inARow: 0, hardCorrect: 0 },
  exam: null,
  examHistory: [],
  flash: {},
  study: {},
  external: [],
  qotd: null,
});

/**
 * Older ScoreClimb builds stored one flat testDate/targetScore/prevScore; split
 * that into per-test tracks. Mutates and reports whether anything changed.
 */
export function migrateProfile(s: SatState): boolean {
  const p = s.profile as (SatState["profile"] & Record<string, unknown>) | null;
  if (!p || p.tests) return false;
  const tests = {
    sat: {
      testDate: (p.testDate as string) || null,
      targetScore: (p.targetScore as number) || 1300,
      prevScore: null as number | null,
    },
    psat: { testDate: null, targetScore: 1210, prevScore: null as number | null },
  };
  if (p.prevType === "SAT") tests.sat.prevScore = p.prevScore as number;
  else if (p.prevType === "PSAT") tests.psat.prevScore = p.prevScore as number;
  p.tests = tests;
  delete p.testDate;
  delete p.targetScore;
  delete p.prevScore;
  delete p.prevType;
  return true;
}

/** Parse a stored document (or a backup file) into a full state. */
export function parseState(raw: unknown): SatState {
  const s = Object.assign(defaultState(), raw && typeof raw === "object" ? raw : {});
  migrateProfile(s);
  if (!s.examHistory) s.examHistory = [];
  return s;
}

/** Local calendar date, `YYYY-MM-DD`, offset by whole days. */
export function todayStr(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The streak shown to the student: 0 unless they practised today or yesterday. */
export function liveStreak(s: SatState, now: Date = new Date()): number {
  const { current, lastDay } = s.streak;
  if (!lastDay) return 0;
  return lastDay === todayStr(0, now) || lastDay === todayStr(-1, now) ? current : 0;
}

/* ---------------------------- answer checking ---------------------------- */

/** Read a typed answer as a number — accepts fractions like "3/4" and "1,200". */
export function numVal(input: string): number {
  const str = String(input).trim();
  if (/^-?\d+\s*\/\s*\d+$/.test(str)) {
    const [n, d] = str.split("/").map(Number);
    return d ? n / d : NaN;
  }
  const f = parseFloat(str.replace(/,/g, ""));
  return isNaN(f) ? NaN : f;
}

/** Student-produced response: exact text match, or numerically equal. */
export function checkSpr(q: Pick<Question, "correct">, val: string): boolean {
  const norm = (s: string) => String(s).replace(/\s+/g, "").toLowerCase();
  if (q.correct.some((c) => norm(c) === norm(val))) return true;
  const v = numVal(val);
  if (isNaN(v)) return false;
  return q.correct.some((c) => {
    const cv = numVal(c);
    return !isNaN(cv) && Math.abs(cv - v) < 1e-4;
  });
}

export function isCorrect(q: Question, answer: string | undefined): boolean {
  if (answer === undefined) return false;
  return q.type === "mcq" ? q.correct.includes(answer) : checkSpr(q, answer);
}

/* ------------------------------- recording ------------------------------- */

export interface AnswerOutcome {
  xp: number;
  /** Set when this answer started or extended the streak today. */
  streakNow: number | null;
  newBadges: BadgeDef[];
}

/** Award a badge once. Returns it if it's new. */
export function award(s: SatState, id: string): BadgeDef | null {
  if (s.badges.includes(id)) return null;
  s.badges.push(id);
  return BADGES.find((b) => b.id === id) ?? null;
}

/** Badges earned from running totals and the streak. */
export function checkBadges(s: SatState, now: Date = new Date()): BadgeDef[] {
  const c = s.counters;
  const streak = liveStreak(s, now);
  const earned: (BadgeDef | null)[] = [];
  if (c.inARow >= 10) earned.push(award(s, "sharp"));
  if (c.answered >= 100) earned.push(award(s, "century"));
  if (c.hardCorrect >= 15) earned.push(award(s, "hardcore"));
  if (streak >= 3) earned.push(award(s, "streak3"));
  if (streak >= 7) earned.push(award(s, "streak7"));
  if (streak >= 30) earned.push(award(s, "streak30"));
  return earned.filter((b): b is BadgeDef => b !== null);
}

/**
 * Record one first-attempt answer: XP, per-skill/domain/section stats, the
 * seen and missed lists, running counters, the daily history and the streak.
 */
export function recordAnswer(
  s: SatState,
  q: Question,
  correct: boolean,
  userAnswer?: string,
  now: Date = new Date(),
): AnswerOutcome {
  const xp = correct ? (DIFF_XP[q.difficulty] ?? 10) : 2;
  s.xp += xp;

  const sk = s.skills[q.skill] ?? (s.skills[q.skill] = { desc: q.skillDesc, section: q.section, attempts: 0, correct: 0 });
  sk.attempts++;
  if (correct) sk.correct++;
  const dm = s.domains[q.domain] ?? (s.domains[q.domain] = { desc: q.domainDesc, section: q.section, attempts: 0, correct: 0 });
  dm.attempts++;
  if (correct) dm.correct++;
  const ss = s.sectionStats[q.section];
  const weight = DIFF_WEIGHT[q.difficulty] ?? 1;
  ss.att++;
  ss.wsum += weight;
  if (correct) {
    ss.corr++;
    ss.wcorr += weight;
  }

  s.seen[q.id] = true;
  const mi = s.missed.indexOf(q.id);
  if (correct) {
    if (mi > -1) s.missed.splice(mi, 1);
    delete s.missedAnswers[q.id];
  } else {
    if (mi === -1) s.missed.push(q.id);
    s.missedAnswers[q.id] = userAnswer;
  }

  s.counters.answered++;
  s.counters.inARow = correct ? s.counters.inARow + 1 : 0;
  if (correct && q.difficulty === "H") s.counters.hardCorrect++;

  const t = todayStr(0, now);
  const h = s.history[t] ?? (s.history[t] = { answered: 0, correct: 0 });
  h.answered++;
  if (correct) h.correct++;

  let streakNow: number | null = null;
  if (s.streak.lastDay !== t) {
    s.streak.current = s.streak.lastDay === todayStr(-1, now) ? liveStreak(s, now) + 1 : 1;
    s.streak.lastDay = t;
    s.streak.best = Math.max(s.streak.best, s.streak.current);
    streakNow = s.streak.current;
  }

  return { xp, streakNow, newBadges: checkBadges(s, now) };
}

/** End-of-set badges: first session, plus the section specialists. */
export function finishSetBadges(s: SatState, qs: Question[], correct: number): BadgeDef[] {
  const earned: (BadgeDef | null)[] = [award(s, "first")];
  const n = qs.length;
  if (n >= 10 && correct / n >= 0.9) {
    if (qs.every((q) => q.section === "math")) earned.push(award(s, "mathwhiz"));
    if (qs.every((q) => q.section === "rw")) earned.push(award(s, "wordsmith"));
  }
  return earned.filter((b): b is BadgeDef => b !== null);
}

/* ------------------------------ score model ------------------------------ */
// SAT and PSAT share one set of practice stats, mapped onto each test's own
// scale — practising improves both estimates at once.

const round10 = (n: number) => Math.round(n / 10) * 10;

export function priorSection(s: SatState, kind: TestKind): number {
  const t = s.profile?.tests[kind];
  const { min, max } = EXAM_SPECS[kind].scale;
  if (t && t.prevScore) return Math.max(min, Math.min(max, t.prevScore / 2));
  return round10((min + max) / 2);
}

export function sectionEstimate(s: SatState, kind: TestKind, sec: Section): number {
  const st = s.sectionStats[sec];
  const { min, max } = EXAM_SPECS[kind].scale;
  const prior = priorSection(s, kind);
  if (!st.att) return round10(prior);
  const adjAcc = Math.min(1, st.wcorr / st.wsum);
  const perf = min + (max - min) * adjAcc;
  // Trust practice data more as it accumulates.
  const w = st.att / (st.att + 15);
  return round10(Math.max(min, Math.min(max, prior * (1 - w) + perf * w)));
}

export const totalEstimate = (s: SatState, kind: TestKind) =>
  sectionEstimate(s, kind, "rw") + sectionEstimate(s, kind, "math");

export function startTotal(s: SatState, kind: TestKind): number {
  const t = s.profile?.tests[kind];
  if (t && t.prevScore) return t.prevScore;
  const { min, max } = EXAM_SPECS[kind].scale;
  return min + max;
}

/** Predicted range — the band narrows as more questions are answered. */
export function prediction(s: SatState, kind: TestKind) {
  const n = s.counters.answered;
  const spread = round10(Math.max(40, 160 - n * 0.4));
  const est = totalEstimate(s, kind);
  const { min, max } = EXAM_SPECS[kind].scale;
  const target = s.profile?.tests[kind].targetScore ?? null;
  return {
    est,
    lo: Math.max(min * 2, est - spread),
    hi: Math.min(max * 2, est + spread),
    target,
    gap: target ? target - est : null,
  };
}

/** Where the "now" marker sits between start and target, as a percentage. */
export function journeyPct(s: SatState, kind: TestKind): number {
  const start = startTotal(s, kind);
  const now = totalEstimate(s, kind);
  const target = s.profile?.tests[kind].targetScore ?? start;
  return Math.max(3, Math.min(100, ((now - start) / Math.max(1, target - start)) * 100));
}

/* --------------------------- strengths breakdown -------------------------- */

export interface DomainRow {
  code: string;
  desc: string;
  acc: number | null;
  att: number;
  tag: "weak" | "strong" | null;
}

/**
 * Sort a domain map weakest-first, and label the single weakest and strongest
 * domain — only once there's enough data for the label to mean something.
 */
export function domainBreakdown(
  domainMap: Record<string, { attempts: number; correct: number } | undefined>,
  section: Section,
): DomainRow[] {
  const rows: DomainRow[] = DOMAINS[section]
    .map((meta) => {
      const st = domainMap[meta.code];
      const acc = st && st.attempts ? Math.round((st.correct / st.attempts) * 100) : null;
      return { code: meta.code, desc: meta.name, acc, att: st ? st.attempts : 0, tag: null as DomainRow["tag"] };
    })
    .sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101));

  const eligible = rows.filter((r) => r.att >= MIN_DOMAIN_ATTEMPTS_FOR_LABEL);
  const weakest = eligible[0];
  const strongest = eligible[eligible.length - 1];
  for (const r of rows) {
    if (eligible.length >= 2 && weakest && strongest && weakest.code !== strongest.code) {
      if (r.code === weakest.code) r.tag = "weak";
      else if (r.code === strongest.code) r.tag = "strong";
    }
  }
  return rows;
}

/** Every skill that exists in the bank for a section, weakest first. */
export function skillRows(s: SatState, rows: CatalogRow[]) {
  const inBank = new Map<string, string>();
  for (const r of rows) inBank.set(r.skill, r.skillDesc);
  return [...inBank.entries()]
    .map(([code, desc]) => {
      const st = s.skills[code];
      const acc = st && st.attempts ? Math.round((st.correct / st.attempts) * 100) : null;
      return { code, desc, acc, att: st ? st.attempts : 0 };
    })
    .sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101));
}

/* ------------------------------- study time ------------------------------- */

export function formatStudy(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export function studyTotals(s: SatState, now: Date = new Date()) {
  const st = s.study || {};
  const today = st[todayStr(0, now)] || 0;
  const ym = todayStr(0, now).slice(0, 7);
  const month = Object.entries(st)
    .filter(([d]) => d.startsWith(ym))
    .reduce((a, [, v]) => a + v, 0);
  return { today, month };
}

/* ------------------------------- onboarding ------------------------------- */

/** Suggested targets a bit above the starting point, converted across scales. */
export function suggestTargets(prevType: "SAT" | "PSAT" | "none", prevScore: number | null) {
  let satBase: number;
  let psatBase: number;
  if (prevType === "SAT" && prevScore) {
    satBase = prevScore;
    psatBase = round10((satBase * 1520) / 1600);
  } else if (prevType === "PSAT" && prevScore) {
    psatBase = prevScore;
    satBase = round10((psatBase * 1600) / 1520);
  } else {
    satBase = 1000;
    psatBase = 950;
  }
  return {
    sat: Math.min(1600, round10(satBase + 150)),
    psat: Math.min(1520, round10(psatBase + 150)),
  };
}

/* ------------------------------- flashcards ------------------------------- */

/** Leitner box for a card; box 3+ counts as mastered. */
export const flashBox = (s: SatState, id: string) => (s.flash?.[id] ?? { box: 0 }).box;

export function gradeFlash(s: SatState, id: string, known: boolean) {
  s.flash = s.flash || {};
  const rec = s.flash[id] ?? (s.flash[id] = { box: 0 });
  rec.box = known ? Math.min(4, rec.box + 1) : 0;
}

/* --------------------------- question of the day -------------------------- */

/** Deterministic per-day candidate indices for a section's question of the day. */
export function qotdCandidates(day: string, section: Section, rowCount: number, tries = 12): number[] {
  const key = day + section;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: tries }, (_, i) => (h + i * 7) % rowCount);
}
