"use client";

// The College Board question bank, loaded from ScoreClimb's published data.
//
// ScoreClimb keeps publishing its bank to its own site (with the weekly
// College Board sync), and `next.config.mjs` proxies `/sat-data/*` to it
// server-side. That keeps the bank same-origin — no CORS — without copying
// 36 MB of question files into this repo, and every sync reaches LifeOS
// automatically.
//
// The data files are ScoreClimb's own `window.X = …` scripts, so they're loaded
// as script tags rather than parsed; the question JSON is fetched on demand.

import type { Catalog, CatalogRow, Guide, Question, SatState, Section, TestKind } from "./types";

export const SAT_DATA_BASE = "/sat-data";

declare global {
  interface Window {
    QB_CATALOG?: Catalog;
    QUESTIONS_DATA?: Question[];
    GUIDES_DATA?: Guide[];
    VOCAB?: [string, string][];
  }
}

const scriptLoads = new Map<string, Promise<void>>();

/** Load one of ScoreClimb's data scripts once per page. */
function loadScript(path: string): Promise<void> {
  const existing = scriptLoads.get(path);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = `${SAT_DATA_BASE}/${path}`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptLoads.delete(path); // allow a retry after a network blip
      reject(new Error("Couldn't reach the question bank"));
    };
    document.head.appendChild(el);
  });
  scriptLoads.set(path, p);
  return p;
}

export async function loadCatalog(): Promise<Catalog> {
  if (!window.QB_CATALOG) await loadScript("bank/catalog.js");
  if (!window.QB_CATALOG) throw new Error("The question catalog didn't load");
  return window.QB_CATALOG;
}

export async function loadGuides(): Promise<Guide[]> {
  if (!window.GUIDES_DATA) await loadScript("guides.js");
  return window.GUIDES_DATA ?? [];
}

export async function loadVocab(): Promise<[string, string][]> {
  if (!window.VOCAB) await loadScript("vocab.js");
  return window.VOCAB ?? [];
}

/** Catalog rows for a test and section (`"all"` for both), in site order. */
export function catalogRows(catalog: Catalog, test: TestKind, section: Section | "all"): CatalogRow[] {
  const secs: Section[] = section === "all" ? ["rw", "math"] : [section];
  const out: CatalogRow[] = [];
  for (const s of secs) {
    for (const r of catalog[test][s]) {
      out.push({
        qid: r[0],
        key: r[1],
        domain: r[2],
        skill: r[3],
        difficulty: r[4],
        section: s,
        skillDesc: catalog.skills[r[3]] || r[3],
      });
    }
  }
  return out;
}

/** College Board's short ID for a question, looked up by its internal key. */
export function qidFor(catalog: Catalog | undefined, key: string): string {
  if (!catalog) return key;
  for (const test of ["sat", "psat"] as const) {
    for (const sec of ["rw", "math"] as const) {
      const row = catalog[test][sec].find((r) => r[1] === key);
      if (row) return row[0];
    }
  }
  return key;
}

/* ------------------------------ question cache ----------------------------- */

const cache = new Map<string, Question>();
let bundleSeeded: Promise<void> | null = null;

export const cachedQuestion = (key: string) => cache.get(key);

/**
 * A few hundred starter questions exist only inside ScoreClimb's bundled
 * `questions.js`, not as individual files. Seed the cache from it the first
 * time an individual fetch comes back missing.
 */
function seedFromBundle(): Promise<void> {
  if (!bundleSeeded) {
    bundleSeeded = loadScript("questions.js")
      .then(() => {
        for (const q of window.QUESTIONS_DATA ?? []) if (!cache.has(q.id)) cache.set(q.id, q);
      })
      .catch((e) => {
        bundleSeeded = null;
        throw e;
      });
  }
  return bundleSeeded;
}

type FetchResult = "ok" | "missing" | "failed";

/** One question, with a timeout and retries so a stalled connection can't hang. */
async function fetchOne(key: string): Promise<FetchResult> {
  let lastReason = "unknown error";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${SAT_DATA_BASE}/q/${key}.json`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.status === 404) return "missing";
      if (!res.ok) {
        lastReason = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      try {
        cache.set(key, JSON.parse(text) as Question);
        return "ok";
      } catch {
        lastReason = `bad JSON (${text.length} bytes)`;
      }
    } catch (e) {
      clearTimeout(timer);
      lastReason = (e as Error).name === "AbortError" ? "timed out after 12s" : (e as Error).message || "network error";
    }
  }
  console.warn(`[sat] skipping ${key}: ${lastReason}`);
  return "failed";
}

/** Question content for these keys, in order. Unloadable ones are dropped. */
export async function getQuestions(keys: string[]): Promise<Question[]> {
  const missing = [...new Set(keys)].filter((k) => !cache.has(k));
  const BATCH = 6;
  let anyAbsent = false;
  for (let i = 0; i < missing.length; i += BATCH) {
    const results = await Promise.all(missing.slice(i, i + BATCH).map(fetchOne));
    if (results.includes("missing")) anyAbsent = true;
  }
  if (anyAbsent) await seedFromBundle();
  return keys.map((k) => cache.get(k)).filter((q): q is Question => Boolean(q));
}

/* --------------------------------- picking --------------------------------- */

export interface PickOptions {
  test?: TestKind;
  section?: Section | "mixed";
  domains?: string[] | "all";
  skills?: string[] | "all";
  diffs?: string[] | "any";
  count?: number;
}

/** Random practice set from the catalog — unseen questions first. */
export async function pickFromCatalog(state: SatState, opts: PickOptions = {}): Promise<Question[]> {
  const { test = "sat", section = "mixed", domains = "all", skills = "all", diffs = "any", count = 10 } = opts;
  const catalog = await loadCatalog();
  let rows = catalogRows(catalog, test, section === "mixed" ? "all" : section).filter(
    (r) =>
      (domains === "all" || domains.includes(r.domain)) &&
      (skills === "all" || skills.includes(r.skill)) &&
      (diffs === "any" || diffs.includes(r.difficulty)),
  );
  const shuffle = <T,>(a: T[]) => a.sort(() => Math.random() - 0.5);
  const unseen = shuffle(rows.filter((r) => !state.seen[r.key]));
  const seen = shuffle(rows.filter((r) => state.seen[r.key]));
  rows = unseen.concat(seen).slice(0, count);
  return getQuestions(rows.map((r) => r.key));
}
