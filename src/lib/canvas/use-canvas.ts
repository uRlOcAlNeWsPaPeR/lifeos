"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedApi, ApiClientError } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import type { CanvasStatusDTO, CanvasSyncCounts } from "./types";

type Origin = "settings" | "onboarding" | "school";

const AUTO_SYNC_STALE_MS = 30 * 60 * 1000;
// Module-level so multiple mounted <useCanvas> consumers only auto-sync once/session.
let autoSyncTried = false;

interface UseCanvas {
  status: CanvasStatusDTO | null;
  loading: boolean;
  syncing: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  connect: (instanceUrl: string, origin?: Origin) => Promise<void>;
  connectWithToken: (instanceUrl: string, accessToken: string) => Promise<boolean>;
  sync: (opts?: { silent?: boolean }) => Promise<CanvasSyncCounts | null>;
  disconnect: (canvasTasks: "keep" | "remove") => Promise<boolean>;
  checkForUpdates: () => Promise<CanvasUpdateCheck | null>;
}

export interface CanvasUpdateCheck {
  connected: boolean;
  hasUpdates: boolean;
  count?: number;
  newestAt?: string | null;
}

export function useCanvas(): UseCanvas {
  const [status, setStatus] = useState<CanvasStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await authedApi<CanvasStatusDTO>("/api/canvas/status");
      if (mounted.current) setStatus(s);
    } catch {
      /* leave prior status; the app must not break on this */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const sync = useCallback<UseCanvas["sync"]>(
    async (opts) => {
      const silent = opts?.silent ?? false;
      if (mounted.current) setSyncing(true);
      try {
        const res = await authedApi<{ counts: CanvasSyncCounts }>("/api/canvas/sync", {
          method: "POST",
        });
        await refresh();
        if (!silent) toast("Canvas synced", "success");
        return res.counts;
      } catch (e) {
        if (!silent) {
          const msg =
            e instanceof ApiClientError && e.status === 401
              ? "Your Canvas authorization expired — reconnect in Settings."
              : "Canvas couldn't sync right now. We'll try again later.";
          toast(msg, "error");
        }
        await refresh();
        return null;
      } finally {
        if (mounted.current) setSyncing(false);
      }
    },
    [refresh],
  );

  const connect = useCallback<UseCanvas["connect"]>(
    async (instanceUrl, origin = "settings") => {
      if (mounted.current) setBusy(true);
      try {
        const { authorizeUrl } = await authedApi<{ authorizeUrl: string }>(
          "/api/canvas/connect",
          { method: "POST", body: { instanceUrl, origin } },
        );

        const popup = window.open(
          authorizeUrl,
          "canvas-oauth",
          "width=620,height=780,menubar=no,toolbar=no",
        );

        if (!popup) {
          // Popup blocked — fall back to a full-page redirect.
          window.location.href = authorizeUrl;
          return;
        }

        const result = await waitForOAuth(popup);
        if (result.ok) {
          toast("Canvas connected", "success");
          await refresh();
          await sync({ silent: true });
        } else if (result.reason === "denied") {
          toast("Canvas wasn't connected. You can try again anytime in Settings.", "error");
        } else if (result.reason === "closed") {
          /* user just closed the window — stay quiet */
        } else {
          toast("Couldn't connect Canvas. Please try again.", "error");
        }
      } catch (e) {
        const msg =
          e instanceof ApiClientError ? e.message : "Couldn't start the Canvas connection.";
        toast(msg, "error");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh, sync],
  );

  const connectWithToken = useCallback<UseCanvas["connectWithToken"]>(
    async (instanceUrl, accessToken) => {
      if (mounted.current) setBusy(true);
      try {
        await authedApi("/api/canvas/connect-token", {
          method: "POST",
          body: { instanceUrl, accessToken },
        });
        toast("Canvas connected", "success");
        await refresh();
        await sync({ silent: true });
        return true;
      } catch (e) {
        const msg =
          e instanceof ApiClientError && e.status === 401
            ? "Canvas rejected that access token. Generate a new one and try again."
            : e instanceof ApiClientError
              ? e.message
              : "Couldn't connect Canvas. Please try again.";
        toast(msg, "error");
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh, sync],
  );

  const disconnect = useCallback<UseCanvas["disconnect"]>(
    async (canvasTasks) => {
      if (mounted.current) setBusy(true);
      try {
        await authedApi("/api/canvas/disconnect", {
          method: "POST",
          body: { canvasTasks },
        });
        await refresh();
        toast("Canvas disconnected", "success");
        return true;
      } catch {
        toast("Couldn't disconnect Canvas. Please try again.", "error");
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh],
  );

  const checkForUpdates = useCallback<UseCanvas["checkForUpdates"]>(async () => {
    try {
      return await authedApi<CanvasUpdateCheck>("/api/canvas/check");
    } catch {
      return null;
    }
  }, []);

  // initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // throttled auto-sync when the app opens with a stale connection
  useEffect(() => {
    if (autoSyncTried || !status?.connected) return;
    if (status.status === "reauth_required") return;
    const last = status.lastSyncedAt ? new Date(status.lastSyncedAt).getTime() : 0;
    if (Date.now() - last < AUTO_SYNC_STALE_MS) return;
    autoSyncTried = true;
    void sync({ silent: true });
  }, [status, sync]);

  return {
    status,
    loading,
    syncing,
    busy,
    refresh,
    connect,
    connectWithToken,
    sync,
    disconnect,
    checkForUpdates,
  };
}

/** Resolve when the OAuth popup posts a result or the user closes it. */
function waitForOAuth(
  popup: Window,
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; reason?: string }) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
      resolve(r);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "lifeos:canvas-oauth") return;
      finish({ ok: Boolean(e.data.ok), reason: e.data.reason ?? undefined });
    };
    window.addEventListener("message", onMessage);

    const poll = setInterval(() => {
      if (popup.closed) finish({ ok: false, reason: "closed" });
    }, 600);
  });
}
