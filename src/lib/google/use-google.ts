"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedApi, ApiClientError } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import type { GoogleStatusDTO, GoogleSyncCounts } from "./types";

const AUTO_SYNC_STALE_MS = 30 * 60 * 1000;
// Module-level so multiple mounted <useGoogle> consumers only auto-sync once/session.
let autoSyncTried = false;

interface UseGoogle {
  status: GoogleStatusDTO | null;
  loading: boolean;
  syncing: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  sync: (opts?: { silent?: boolean }) => Promise<GoogleSyncCounts | null>;
  disconnect: (googleEvents: "keep" | "remove") => Promise<boolean>;
}

export function useGoogle(): UseGoogle {
  const [status, setStatus] = useState<GoogleStatusDTO | null>(null);
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
      const s = await authedApi<GoogleStatusDTO>("/api/google/status");
      if (mounted.current) setStatus(s);
    } catch {
      /* leave prior status; the app must not break on this */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const sync = useCallback<UseGoogle["sync"]>(
    async (opts) => {
      const silent = opts?.silent ?? false;
      if (mounted.current) setSyncing(true);
      try {
        const res = await authedApi<{ counts: GoogleSyncCounts }>("/api/google/sync", {
          method: "POST",
        });
        await refresh();
        if (!silent) toast("Google Calendar synced", "success");
        return res.counts;
      } catch (e) {
        if (!silent) {
          const msg =
            e instanceof ApiClientError && e.status === 401
              ? "Your Google Calendar authorization expired — reconnect in Settings."
              : "Google Calendar couldn't sync right now. We'll try again later.";
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

  const connect = useCallback<UseGoogle["connect"]>(async () => {
    if (mounted.current) setBusy(true);
    try {
      const { authorizeUrl } = await authedApi<{ authorizeUrl: string }>("/api/google/connect", {
        method: "POST",
      });

      const popup = window.open(
        authorizeUrl,
        "google-oauth",
        "width=520,height=720,menubar=no,toolbar=no",
      );

      if (!popup) {
        // Popup blocked — fall back to a full-page redirect.
        window.location.href = authorizeUrl;
        return;
      }

      const result = await waitForOAuth(popup);
      if (result.ok) {
        toast("Google Calendar connected", "success");
        await refresh();
        void sync({ silent: true });
      } else if (result.reason === "denied") {
        toast("Google Calendar wasn't connected. You can try again anytime in Settings.", "error");
      } else if (result.reason === "closed") {
        /* user just closed the window — stay quiet */
      } else {
        toast("Couldn't connect Google Calendar. Please try again.", "error");
      }
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.message : "Couldn't start the Google Calendar connection.";
      toast(msg, "error");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refresh, sync]);

  const disconnect = useCallback<UseGoogle["disconnect"]>(
    async (googleEvents) => {
      if (mounted.current) setBusy(true);
      try {
        await authedApi("/api/google/disconnect", { method: "POST", body: { googleEvents } });
        await refresh();
        toast("Google Calendar disconnected", "success");
        return true;
      } catch {
        toast("Couldn't disconnect Google Calendar. Please try again.", "error");
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh],
  );

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

  return { status, loading, syncing, busy, refresh, connect, sync, disconnect };
}

/** Resolve when the OAuth popup posts a result or the user closes it. */
function waitForOAuth(popup: Window): Promise<{ ok: boolean; reason?: string }> {
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
      if (e.data?.type !== "lifeos:google-oauth") return;
      finish({ ok: Boolean(e.data.ok), reason: e.data.reason ?? undefined });
    };
    window.addEventListener("message", onMessage);

    const poll = setInterval(() => {
      if (popup.closed) finish({ ok: false, reason: "closed" });
    }, 600);
  });
}
