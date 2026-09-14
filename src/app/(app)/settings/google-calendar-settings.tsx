"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Plug,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { LiveDot } from "@/components/ui/misc";
import { toast } from "@/components/ui/toaster";
import { useGoogle } from "@/lib/google/use-google";
import { useAppData } from "@/lib/store/app-data";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// Settings → Schedule. One-way pull only — LifeOS reads your Google Calendar
// events, it never creates or edits anything on Google. Student+ only.
export function GoogleCalendarSettings() {
  const { data } = useAppData();
  const enabled = data.limits.googleCalendarEnabled;
  const google = useGoogle();
  const { status, loading, syncing, busy, connect, sync, disconnect } = google;
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [syncedLabel, setSyncedLabel] = useState<string | null>(null);
  const handledFlag = useRef(false);

  // Handle the ?google= flag from a full-page-redirect fallback (popup blocked).
  useEffect(() => {
    if (handledFlag.current) return;
    const flag = new URLSearchParams(window.location.search).get("google");
    if (!flag) return;
    handledFlag.current = true;
    if (flag === "connected") toast("Google Calendar connected", "success");
    else if (flag === "denied")
      toast("Google Calendar wasn't connected. You can try again anytime.", "error");
    else toast("Couldn't connect Google Calendar. Please try again.", "error");
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  async function handleSync() {
    const counts = await sync();
    if (counts) {
      setSyncedLabel("Synced just now");
      setTimeout(() => setSyncedLabel(null), 4000);
    }
  }

  if (!enabled) {
    return (
      <Card className="flex flex-col items-center gap-3 border-primary/30 bg-primary/[0.05] p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold">Google Calendar is a Student+ feature</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pull your Google Calendar events straight into LifeOS — read-only, nothing is
            ever written back to your calendar.
          </p>
        </div>
        <Link
          href="/settings?tab=plan"
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow-sm"
        >
          See plans <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    );
  }

  if (loading && !status) {
    return <p className="text-sm text-muted-foreground">Checking Google Calendar…</p>;
  }

  if (status && !status.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Google Calendar isn&apos;t set up on this deployment yet. Once an administrator adds
        the Google credentials, you&apos;ll be able to connect here.
      </p>
    );
  }

  const connected = status?.connected;
  const errored = status?.status === "error";
  const needsReauth = status?.status === "reauth_required";

  return (
    <div className="space-y-5">
      {!connected && (
        <>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Connect Google Calendar</p>
              <p className="text-sm text-muted-foreground">
                Bring your Google Calendar events into LifeOS&apos;s calendar. Read-only —
                LifeOS never creates, edits or deletes anything on your Google Calendar.
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            <Button loading={busy} onClick={connect}>
              Connect Google Calendar
            </Button>
            <p className="text-xs text-muted-foreground">
              You&apos;ll sign in on Google&apos;s own page. LifeOS never sees your password —
              only your calendar events, and only to read them.
            </p>
          </div>
        </>
      )}

      {connected && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-xl",
                  needsReauth || errored
                    ? "bg-warning/15 text-warning"
                    : "bg-primary/15 text-primary",
                )}
              >
                {needsReauth || errored ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    <LiveDot />
                  </>
                )}
              </div>
              <div>
                <p className="flex items-center gap-2 font-medium">
                  Google Calendar
                  <Badge tone={needsReauth || errored ? "warning" : "success"}>
                    {needsReauth ? "Reconnect needed" : errored ? "Sync issue" : "Connected"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">Read-only · your primary calendar</p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Last synced</p>
              <p className="font-medium text-foreground">
                {syncedLabel ?? timeAgo(status?.lastSyncedAt)}
              </p>
            </div>
          </div>

          {status?.message && <p className="text-sm text-warning">{status.message}</p>}

          {needsReauth ? (
            <div className="space-y-2.5">
              <p className="text-sm text-muted-foreground">
                Your Google Calendar authorization expired. Reconnect to keep syncing.
              </p>
              <Button loading={busy} onClick={connect}>
                Reconnect Google Calendar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} loading={syncing}>
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : errored ? "Try again" : "Sync now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnect(true)}
                disabled={busy}
              >
                <Plug className="h-4 w-4" /> Disconnect Google Calendar
              </Button>
            </div>
          )}
        </>
      )}

      <DisconnectModal
        open={showDisconnect}
        busy={busy}
        onClose={() => setShowDisconnect(false)}
        onConfirm={async (choice) => {
          const okDone = await disconnect(choice);
          if (okDone) setShowDisconnect(false);
        }}
      />
    </div>
  );
}

function DisconnectModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (choice: "keep" | "remove") => void;
}) {
  const [choice, setChoice] = useState<"keep" | "remove">("keep");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Disconnect Google Calendar?"
      description="LifeOS will stop syncing with Google Calendar and your stored access will be revoked."
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">What should happen to the imported events?</p>
        {(
          [
            {
              id: "keep" as const,
              title: "Keep them in LifeOS",
              blurb: "Imported events stay on your calendar, but stop updating from Google.",
            },
            {
              id: "remove" as const,
              title: "Remove imported events",
              blurb: "Deletes every event LifeOS pulled from Google. Your own events are untouched.",
            },
          ]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setChoice(opt.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
              choice === opt.id
                ? "border-primary bg-primary/10"
                : "border-white/10 hover:bg-white/5",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                choice === opt.id ? "border-primary" : "border-white/25",
              )}
            >
              {choice === opt.id && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span>
              <span className="block font-medium">{opt.title}</span>
              <span className="block text-xs text-muted-foreground">{opt.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={choice === "remove" ? "destructive" : "primary"}
          loading={busy}
          onClick={() => onConfirm(choice)}
        >
          Disconnect
        </Button>
      </div>
    </Modal>
  );
}
