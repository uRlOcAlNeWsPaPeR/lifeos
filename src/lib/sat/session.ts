"use client";

// The practice set in progress. It lives in memory while you're on the runner;
// leaving it — by the sidebar, the back button, closing the tab — saves it as a
// paused session you can resume from Practice, exactly as ScoreClimb did.

import { commit, sat } from "./store";
import { getQuestions } from "./qbank";
import type { BadgeDef } from "./constants";
import type { Question } from "./types";

export interface LiveSession {
  qs: Question[];
  idx: number;
  correct: number;
  xp: number;
  /** "mixed" | "rw" | "math" — used for the default saved name. */
  section: string;
  startedISO: string;
  name: string | null;
  newBadges: BadgeDef[];
  marked: Record<string, boolean>;
}

let live: LiveSession | null = null;

export const liveSession = () => live;

export function beginSession(qs: Question[], section: string): LiveSession {
  live = {
    qs,
    idx: 0,
    correct: 0,
    xp: 0,
    section,
    startedISO: new Date().toISOString(),
    name: null,
    newBadges: [],
    marked: {},
  };
  return live;
}

export function defaultSessionName(section: string): string {
  return `${section === "mixed" ? "Mixed" : section === "rw" ? "Reading & Writing" : "Math"} practice`;
}

/** Save the set — including the unanswered question's position — to resume later. */
export function autosaveSession(): void {
  if (!live || !live.qs.length) return;
  const cur = live;
  commit((s) => {
    s.pausedQuiz = {
      name: cur.name || defaultSessionName(cur.section),
      startedISO: cur.startedISO,
      qids: cur.qs.map((q) => q.id),
      idx: cur.idx,
      session: { correct: cur.correct, xp: cur.xp, section: cur.section },
    };
  });
}

/** Stop tracking the set without saving it — it's finished. */
export function endSession(): void {
  live = null;
}

/** Leave the set, saving it first. */
export function leaveSession(): void {
  autosaveSession();
  live = null;
}

/** Reload a paused set. Throws if none of its questions can be loaded. */
export async function resumePausedSession(): Promise<LiveSession> {
  const p = sat().pausedQuiz;
  if (!p) throw new Error("There's no paused session to resume");
  const qs = await getQuestions(p.qids);
  if (!qs.length) throw new Error("Saved questions are no longer available");
  live = {
    qs,
    idx: Math.min(p.idx, qs.length - 1),
    correct: p.session.correct,
    xp: p.session.xp,
    section: p.session.section,
    startedISO: p.startedISO,
    name: p.name,
    newBadges: [],
    marked: {},
  };
  commit((s) => {
    s.pausedQuiz = null;
  });
  return live;
}
