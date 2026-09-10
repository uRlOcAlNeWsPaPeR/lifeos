"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDTO } from "@/lib/types";

// "Lock in" — the focus ritual for a study session that's happening right now.
// When a study_session event on the calendar covers the current moment, the
// dashboard offers to lock in; while locked, the Core stops detonating and shows
// a countdown instead. The choice is per-session and kept in localStorage so it
// survives leaving and reopening the app, but never outlives the session itself.

export type StudyLockStatus = "idle" | "locked" | "paused" | "ended";

interface Stored {
  eventId: string;
  status: "locked" | "paused" | "ended";
}

const KEY = "lifeos:study-lock:v1";

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Stored;
    if (!p || typeof p.eventId !== "string") return null;
    if (!["locked", "paused", "ended"].includes(p.status)) return null;
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

export interface StudyLock {
  /** The study session covering right now, or null. */
  session: EventDTO | null;
  status: StudyLockStatus;
  /** ms remaining in the current session (0 when none). */
  msLeft: number;
  /** Show the "lock in?" prompt — a live session the user hasn't locked or ended. */
  shouldPrompt: boolean;
  /** True when the pending prompt is a resume (was paused), not a first ask. */
  resuming: boolean;
  lockIn: () => void;
  pause: () => void;
  endSession: () => void;
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
        .filter((e) => e.kind === "study_session" && e.startAt && e.endAt)
        .map((e) => ({ e, start: +new Date(e.startAt), end: +new Date(e.endAt) }))
        .filter((x) => Number.isFinite(x.start) && x.start <= now && now < x.end)
        .sort((a, b) => a.end - b.end)[0]?.e ?? null
    );
  }, [events, now]);

  const [stored, setStored] = useState<Stored | null>(() => {
    if (typeof window === "undefined") return null;
    return load();
  });

  // The stored choice only applies to the session it was made for. Clear it once
  // that session is over (or a different one is now live).
  useEffect(() => {
    if (!stored) return;
    if (!session || stored.eventId !== session.id) {
      setStored(null);
      save(null);
    }
  }, [session, stored]);

  const write = useCallback((next: Stored | null) => {
    setStored(next);
    save(next);
  }, []);

  const status: StudyLockStatus = !session
    ? "idle"
    : stored?.eventId === session.id
      ? stored.status
      : "idle";

  const msLeft = session ? Math.max(0, +new Date(session.endAt) - now) : 0;

  return {
    session,
    status,
    msLeft,
    shouldPrompt: Boolean(session) && status !== "locked" && status !== "ended",
    resuming: status === "paused",
    lockIn: useCallback(() => {
      if (session) write({ eventId: session.id, status: "locked" });
    }, [session, write]),
    pause: useCallback(() => {
      if (session) write({ eventId: session.id, status: "paused" });
    }, [session, write]),
    endSession: useCallback(() => {
      if (session) write({ eventId: session.id, status: "ended" });
    }, [session, write]),
  };
}
