"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useCanvas } from "@/lib/canvas/use-canvas";
import { CanvasBadge } from "@/components/canvas/canvas-badge";
import { cn } from "@/lib/utils";

const POLL_MS = 10 * 60 * 1000; // background poll while the app is open
const MIN_GAP_MS = 3 * 60 * 1000; // don't re-check more often than this (e.g. on tab focus)

/**
 * While Canvas is connected, quietly checks for new activity (submissions graded,
 * assignments added / due-date changes) and — when there is some — prompts the
 * user to hit Sync. One instance, mounted in the app shell.
 */
export function CanvasSyncNudge() {
  const { status, syncing, sync, checkForUpdates } = useCanvas();
  const [pending, setPending] = useState<{ count: number; newestAt: string | null } | null>(null);
  const dismissedAt = useRef<string | null>(null);
  const lastCheck = useRef(0);

  const connected = status?.connected && status.status === "connected";

  const runCheck = useCallback(async () => {
    if (!connected) return;
    if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = Date.now();
    const res = await checkForUpdates();
    if (!res?.hasUpdates) return;
    if (res.newestAt && res.newestAt === dismissedAt.current) return; // already dismissed this
    setPending({ count: res.count ?? 1, newestAt: res.newestAt ?? null });
  }, [connected, checkForUpdates]);

  // first check shortly after mount, then on an interval
  useEffect(() => {
    if (!connected) {
      setPending(null);
      return;
    }
    const t = setTimeout(runCheck, 8000);
    const id = setInterval(runCheck, POLL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [connected, runCheck]);

  // check again when the user returns to the tab
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

  if (!pending) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[90] sm:inset-x-auto sm:left-4 sm:max-w-xs">
      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-popover/95 p-3.5 shadow-glow-lg backdrop-blur-xl animate-slide-up">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CanvasBadge /> New activity on Canvas
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pending.count} update{pending.count === 1 ? "" : "s"} since your last sync — grades,
            new assignments or due-date changes.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={async () => {
                const res = await sync();
                if (res) setPending(null);
              }}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white shadow-glow-sm disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={() => {
                dismissedAt.current = pending.newestAt;
                setPending(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            dismissedAt.current = pending.newestAt;
            setPending(null);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
