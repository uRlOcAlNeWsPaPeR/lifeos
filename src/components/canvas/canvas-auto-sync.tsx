"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCanvas } from "@/lib/canvas/use-canvas";

const POLL_MS = 8 * 60 * 1000; // background check cadence while the app is open
const MIN_GAP_MS = 2 * 60 * 1000; // floor between checks (e.g. on tab focus)

/**
 * Headless. While Canvas is connected, quietly polls for new activity — a
 * submission graded, a new assignment, a due-date change — and re-syncs on its
 * own when it finds any. No UI: the sync is silent and the rest of the app just
 * sees fresh Firestore data. One instance, mounted in the app shell.
 */
export function CanvasAutoSync() {
  const { status, syncing, sync, checkForUpdates } = useCanvas();
  const lastCheck = useRef(0);
  const lastHandledActivity = useRef<string | null>(null);
  const busy = useRef(false);

  const connected = status?.connected && status.status === "connected";

  const runCheck = useCallback(async () => {
    if (!connected || syncing || busy.current) return;
    if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = Date.now();

    const res = await checkForUpdates();
    if (!res?.hasUpdates) return;
    // don't loop on the same batch of activity we already synced for
    if (res.newestAt && res.newestAt === lastHandledActivity.current) return;

    busy.current = true;
    try {
      const counts = await sync({ silent: true });
      if (counts) lastHandledActivity.current = res.newestAt ?? null;
    } finally {
      busy.current = false;
    }
  }, [connected, syncing, checkForUpdates, sync]);

  // first check shortly after mount, then on an interval
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(runCheck, 6000);
    const id = setInterval(runCheck, POLL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [connected, runCheck]);

  // and whenever the user comes back to the tab
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [runCheck]);

  return null;
}
