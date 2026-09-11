"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDTO } from "@/lib/types";

// "Lock in" — the focus ritual for a study session that's happening right now.
// When a study_session event on the calendar covers the current moment, LifeOS
// nags the student to lock in on every page. While locked, the Core stops
// detonating and shows a countdown instead. The choice is per-session and kept
// in localStorage so it survives leaving and reopening the app, but never
// outlives the session itself.

export type StudyLockStatus = "idle" | "locked" | "paused" | "ended" | "dismissed";

type Decision = "none" | "locked" | "paused" | "ended" | "dismissed";

interface Stored {
  eventId: string;
  decision: Decision;
  /** epoch ms — suppress the auto-prompt until then ("remind me in N min"). */
  snoozeUntil?: number;
}

const KEY = "lifeos:study-lock:v1";
const SYNC_EVENT = "lifeos:study-lock";
const DECISIONS: Decision[] = ["none", "locked", "paused", "ended", "dismissed"];

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Stored;
    if (!p || typeof p.eventId !== "string" || !DECISIONS.includes(p.decision)) return null;
    return p;
  } catch {
    return null;
  }
}

function save(v: Stored | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — the lock still works for this page view */
  }
}

// Lets any component (a study session in the calendar, the dashboard Today row)
// pop the lock-in dialog on demand — the only way in once "Don't show again" was
// clicked. Backed by the single mounted <StudyLockPrompt/>.
let promptOpener: (() => void) | null = null;
export function registerStudyLockPrompt(fn: (() => void) | null) {
  promptOpener = fn;
}
export function openStudyLockPrompt() {
  promptOpener?.();
}

/** Take over the screen for a focus session (must be called from a user gesture). */
export function enterFocusFullscreen() {
  try {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {
    /* unsupported / blocked — the lock still works windowed */
  }
}

export function exitFocusFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Human "42m left" / "1h 20m left" from a ms remaining. */
export function fmtLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  if (total >= 60) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${total || 1}m`;
}

export interface StudyLock {
  /** The study session covering right now, or null. */
  session: EventDTO | null;
  status: StudyLockStatus;
  /** ms remaining in the current session (0 when none). */
  msLeft: number;
  /** Auto-nag the student — a live session they haven't locked, ended, dismissed or snoozed. */
  shouldPrompt: boolean;
  /** True when the pending prompt is a resume (was paused), not a first ask. */
  resuming: boolean;
  /** epoch ms the current snooze runs until, or null. */
  snoozeUntil: number | null;
  lockIn: () => void;
  pause: () => void;
  endSession: () => void;
  /** "Don't show again" — no more auto-prompts; manual lock-in still works. */
  dismiss: () => void;
  /** "Remind me in N minutes." */
  snooze: (minutes: number) => void;
}

export function useStudyLock(events: EventDTO[]): StudyLock {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const session = useMemo(() => {
    return (
      events
        // `locked === false` = a plain calendar block the student opted out of;
        // anything else (true, or unset on older sessions) still locks.
        .filter(
          (e) => e.kind === "study_session" && e.locked !== false && e.startAt && e.endAt,
        )
        .map((e) => ({ e, start: +new Date(e.startAt), end: +new Date(e.endAt) }))
        .filter((x) => Number.isFinite(x.start) && x.start <= now && now < x.end)
        .sort((a, b) => a.end - b.end)[0]?.e ?? null
    );
  }, [events, now]);

  // Re-evaluate the instant the current session ends, so "lock" clears the
  // moment the time is actually up — not up to a 15s tick later.
  useEffect(() => {
    if (!session) return;
    const ms = +new Date(session.endAt) - Date.now();
    if (ms <= 0) {
      setNow(Date.now());
      return;
    }
    const id = setTimeout(() => setNow(Date.now()), ms + 200);
    return () => clearTimeout(id);
  }, [session]);

  const [stored, setStored] = useState<Stored | null>(() => {
    if (typeof window === "undefined") return null;
    return load();
  });

  // Keep every mounted instance (the global prompt + the dashboard Core) in sync,
  // and pick up a change made in another tab.
  useEffect(() => {
    const resync = () => setStored(load());
    window.addEventListener(SYNC_EVENT, resync);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener(SYNC_EVENT, resync);
      window.removeEventListener("storage", resync);
    };
  }, []);

  // The stored choice only applies to the session it was made for. Clear it once
  // that session is over (or a different one is now live).
  useEffect(() => {
    if (!stored) return;
    if (!session || stored.eventId !== session.id) {
      setStored(null);
      save(null);
    }
  }, [session, stored]);

  const forSession = stored && session && stored.eventId === session.id ? stored : null;

  const write = useCallback((next: Stored | null) => {
    setStored(next);
    save(next);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const set = useCallback(
    (patch: Partial<Omit<Stored, "eventId">>) => {
      if (!session) return;
      const base: Stored =
        stored && stored.eventId === session.id
          ? stored
          : { eventId: session.id, decision: "none" };
      write({ ...base, eventId: session.id, ...patch });
    },
    [session, stored, write],
  );

  const decision: Decision = forSession?.decision ?? "none";
  const status: StudyLockStatus = !session ? "idle" : decision === "none" ? "idle" : decision;

  const snoozeUntil = forSession?.snoozeUntil ?? null;
  const snoozed = snoozeUntil != null && snoozeUntil > now;

  const msLeft = session ? Math.max(0, +new Date(session.endAt) - now) : 0;

  return {
    session,
    status,
    msLeft,
    shouldPrompt:
      Boolean(session) &&
      status !== "locked" &&
      status !== "ended" &&
      status !== "dismissed" &&
      !snoozed,
    resuming: status === "paused",
    snoozeUntil,
    lockIn: useCallback(() => set({ decision: "locked", snoozeUntil: undefined }), [set]),
    pause: useCallback(() => set({ decision: "paused", snoozeUntil: undefined }), [set]),
    endSession: useCallback(() => set({ decision: "ended", snoozeUntil: undefined }), [set]),
    dismiss: useCallback(() => set({ decision: "dismissed", snoozeUntil: undefined }), [set]),
    snooze: useCallback(
      (minutes: number) => set({ snoozeUntil: Date.now() + minutes * 60_000 }),
      [set],
    ),
  };
}
