"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/store/app-data";
import { notify, notifyPermission, inQuietHours } from "@/lib/notify";

// Watches tasks with a "plan to work on it" time (scheduledAt) and fires an OS
// notification when it's time to start — plus a heads-up `leadMinutes` before,
// same setting the Settings > Notifications screen already exposes. Only runs
// while a LifeOS tab is open (see lib/notify.ts) — there's no push backend.

const TICK_MS = 20_000;
// Wide enough to guarantee at least one tick lands in the window, narrow
// enough that a task never fires twice.
const FIRE_WINDOW_MS = 30_000;
const FIRED_KEY = "lifeos:reminders-fired:v1";

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s]));
  } catch {
    /* private mode — reminders still fire this session, just may repeat next load */
  }
}

export function TaskReminders() {
  const { data } = useAppData();
  const router = useRouter();
  const firedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (firedRef.current === null) firedRef.current = loadFired();
    const fired = firedRef.current;

    function tick() {
      const { reminders, alarmsEnabled } = data.profile.prefs;
      if (!alarmsEnabled || !reminders.enabled || !reminders.taskReminders) return;
      if (notifyPermission() !== "granted") return;

      const now = Date.now();
      const quiet = inQuietHours(reminders.quietStart, reminders.quietEnd);
      const valid = new Set<string>();

      for (const t of data.tasks) {
        if (t.status !== "todo" || !t.scheduledAt) continue;
        const startMs = new Date(t.scheduledAt).getTime();
        if (!Number.isFinite(startMs)) continue;

        const leadKey = `${t.id}:${t.scheduledAt}:lead`;
        const startKey = `${t.id}:${t.scheduledAt}:start`;
        valid.add(leadKey);
        valid.add(startKey);
        if (quiet) continue;

        const leadMs = startMs - reminders.leadMinutes * 60_000;
        if (
          reminders.leadMinutes > 0 &&
          now >= leadMs &&
          now < leadMs + FIRE_WINDOW_MS &&
          !fired.has(leadKey)
        ) {
          fired.add(leadKey);
          notify(`Starting soon: ${t.title}`, {
            body: `You planned to start this in ${reminders.leadMinutes} min.`,
            tag: leadKey,
            sound: true,
            kind: "reminder",
            onClick: () => router.push("/tasks"),
          });
        }

        if (now >= startMs && now < startMs + FIRE_WINDOW_MS && !fired.has(startKey)) {
          fired.add(startKey);
          notify(`Time to start: ${t.title}`, {
            body: "This is when you planned to work on it.",
            tag: startKey,
            sound: true,
            kind: "reminder",
            onClick: () => router.push("/tasks"),
          });
        }
      }

      // Drop keys for tasks that are done, deleted, or rescheduled so this
      // never grows without bound.
      for (const k of fired) if (!valid.has(k)) fired.delete(k);
      saveFired(fired);
    }

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [data.tasks, data.profile.prefs, router]);

  return null;
}
