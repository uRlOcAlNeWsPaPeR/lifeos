/**
 * Parity check: runs ScoreClimb's ORIGINAL JavaScript side by side with the
 * LifeOS port on the real question catalog, and asserts they agree — exam
 * assembly (including reproducible library exams), adaptive scoring, answer
 * checking, the score estimate, the strengths breakdown, and the full state
 * mutation from recording answers.
 *
 * Dev-only: it needs ScoreClimb's source on disk, which isn't in this repo.
 *
 *   SCORECLIMB_DIR="/path/to/sat-prep-deploy" npx tsx scripts/sat-parity.ts
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { buildModule, scoreSection } from "@/lib/sat/exam";
import { checkSpr, defaultState, domainBreakdown, recordAnswer, sectionEstimate, finishSetBadges } from "@/lib/sat/engine";
import { catalogRows } from "@/lib/sat/qbank";
import type { Catalog, ExamModule, Question, SatState } from "@/lib/sat/types";

const DIR =
  process.env.SCORECLIMB_DIR ??
  path.join(process.env.HOME ?? "", "Documents/SAT practice app/sat-prep-deploy");

if (!fs.existsSync(path.join(DIR, "js/app.js"))) {
  console.log(`- skipped: ScoreClimb source not found at ${DIR}`);
  process.exit(0);
}

/* ---------------------- load the original into a sandbox ---------------------- */

// A universal DOM stand-in: every property is itself, every call returns itself.
// Enough for ScoreClimb's top-level setup (confetti canvas, panel wiring, boot)
// to run without a browser; the logic under test never touches the DOM.
const stub: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : k === "then" ? undefined : stub),
  apply: () => stub,
  construct: () => stub as object,
});

const store: Record<string, string> = {};
const sandbox: Record<string, unknown> = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  addEventListener: () => {},
  scrollTo: () => {},
  innerWidth: 1280,
  innerHeight: 800,
  location: { protocol: "https:", reload() {} },
  document: {
    getElementById: () => stub,
    querySelector: () => stub,
    querySelectorAll: () => [],
    createElement: () => stub,
    createElementNS: () => stub,
    addEventListener: () => {},
    documentElement: stub,
    body: stub,
    head: stub,
  },
  localStorage: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
  fetch: () => Promise.reject(new Error("offline")),
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);

for (const f of ["data/bank/catalog.js", "js/qbank.js", "js/exam.js", "js/bank.js", "js/flash.js", "js/daily.js", "js/app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f });
}
const run = <T,>(code: string): T => vm.runInContext(code, ctx) as T;
const catalog = run<Catalog>("window.QB_CATALOG");

let checks = 0;
const same = (a: unknown, b: unknown, what: string) => {
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), what);
  checks++;
};

/* ----------------------- library exams: exact questions ----------------------- */

for (const kind of ["sat", "psat"] as const) {
  for (let lib = 1; lib <= 10; lib++) {
    // Original: build the four modules of library exam `lib` in order.
    const original = run<string[][]>(`(() => {
      state.exam = { kind: ${JSON.stringify(kind)}, lib: ${lib}, seed: ${lib} * 7919 + (${JSON.stringify(kind)} === 'psat' ? 101 : 13),
        startedISO: '', phase: 'module', cur: 0, used: [], modules: [], breakLeft: 600 };
      const plan = [['rw','base'],['rw','hard'],['math','base'],['math','easy']];
      for (const [sec, route] of plan) state.exam.modules.push(Exam.buildModule(sec, route));
      return state.exam.modules.map(m => m.qids);
    })()`);

    const ex = { kind, lib, seed: lib * 7919 + (kind === "psat" ? 101 : 13), startedISO: "", phase: "module" as const, cur: 0, used: [] as string[], modules: [] as ExamModule[], breakLeft: 600 };
    const plan = [["rw", "base"], ["rw", "hard"], ["math", "base"], ["math", "easy"]] as const;
    for (const [sec, route] of plan) ex.modules.push(buildModule(ex, sec, route, catalogRows(catalog, kind, sec)));
    same(ex.modules.map((m) => m.qids), original, `${kind} library exam ${lib}`);
  }
}

/* -------------------------------- scoring -------------------------------- */

for (const kind of ["sat", "psat"] as const) {
  for (const route of ["easy", "hard"] as const) {
    for (let c1 = 0; c1 <= 27; c1 += 3) {
      for (let c2 = 0; c2 <= 27; c2 += 3) {
        const m1 = { total: 27, correct: c1, route: "base" } as ExamModule;
        const m2 = { total: 27, correct: c2, route } as ExamModule;
        same(scoreSection(kind, m1, m2), run(`Exam.scoreSection(${JSON.stringify(kind)}, ${JSON.stringify(m1)}, ${JSON.stringify(m2)})`), `scoreSection ${kind} ${route} ${c1}/${c2}`);
      }
    }
  }
}

/* ---------------------------- answer checking ---------------------------- */

const sprCases: [string[], string][] = [
  [["3/4", ".75"], "0.75"], [["3/4"], "3 / 4"], [["12"], "12.0"], [["1200"], "1,200"],
  [["-2"], "-2.00001"], [["5"], "5.1"], [["abc"], "ABC"], [["2/3"], ".6666"], [["2/3"], ".6667"],
];
for (const [correct, val] of sprCases) {
  same(checkSpr({ correct }, val), run(`Quiz.checkSpr(${JSON.stringify({ correct })}, ${JSON.stringify(val)})`), `checkSpr ${val}`);
}

/* --------------------- recording answers: full state diff --------------------- */

// Replay the same answer stream through both, then compare the whole state.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const rows = catalogRows(catalog, "sat", "all");
const stream = Array.from({ length: 400 }, () => {
  const r = rows[Math.floor(rand() * rows.length)];
  const q: Question = {
    id: r.key, section: r.section, domain: r.domain, domainDesc: r.domain, skill: r.skill,
    skillDesc: r.skillDesc, difficulty: r.difficulty, type: "mcq", stem: "", stimulus: "",
    options: ["", "", "", ""], correct: ["A"],
  };
  return { q, correct: rand() < 0.62, given: "ABCD"[Math.floor(rand() * 4)] };
});

const profile = { name: "P", tests: { sat: { testDate: null, targetScore: 1400, prevScore: 1100 }, psat: { testDate: null, targetScore: 1300, prevScore: null } }, dailyGoal: 10 };
run(`state = DEFAULT_STATE(); state.profile = ${JSON.stringify(profile)}; Quiz.session = { correct: 0, xp: 0, newBadges: [] };`);
const mine: SatState = defaultState();
mine.profile = JSON.parse(JSON.stringify(profile));

for (const { q, correct, given } of stream) {
  run(`Quiz.recordAnswer(${JSON.stringify(q)}, ${correct}, ${JSON.stringify(given)})`);
  recordAnswer(mine, q, correct, given);
}
// End-of-set badge on both sides.
run(`Quiz.award('first')`);
finishSetBadges(mine, [], 0);

const theirs = run<SatState & { apScores?: unknown }>("JSON.parse(JSON.stringify(state))");
// AP scores were dropped from the LifeOS port, so that field only exists on
// ScoreClimb's side. Nothing else about the recorded state may differ.
delete theirs.apScores;
same(mine, theirs, "state after 400 recorded answers");

/* ------------------------ estimate & breakdown on it ------------------------ */

for (const kind of ["sat", "psat"] as const) {
  for (const sec of ["rw", "math"] as const) {
    same(sectionEstimate(mine, kind, sec), run(`Score.sectionEstimate(${JSON.stringify(kind)}, ${JSON.stringify(sec)})`), `sectionEstimate ${kind} ${sec}`);
    same(
      domainBreakdown(mine.domains, sec).map(({ code, acc, att, tag }) => ({ code, acc, att, tag })),
      run<{ code: string; acc: number | null; att: number; tag: string | null }[]>(`domainBreakdown(state.domains, ${JSON.stringify(sec)})`).map(({ code, acc, att, tag }) => ({ code, acc, att, tag })),
      `domainBreakdown ${sec}`,
    );
  }
}

console.log(`✓ sat parity: ${checks} checks agree with ScoreClimb's original code`);
