"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, GraduationCap, CheckCircle2, AlertTriangle, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";
import { useCanvas } from "@/lib/canvas/use-canvas";
import { timeAgo } from "@/lib/format";
import { ConnectCanvas } from "@/components/canvas/connect-canvas";
import { CanvasCoursePicker } from "@/components/canvas/course-picker";
import { cn } from "@/lib/utils";

// Settings → School. Connection status, manual sync, disconnect. Canvas being
// unavailable never disables the rest of LifeOS.
export function CanvasSettings() {
  const canvas = useCanvas();
  const { status, loading, syncing, busy, connect, connectWithToken, sync, disconnect } =
    canvas;
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [syncedLabel, setSyncedLabel] = useState<string | null>(null);
  const handledFlag = useRef(false);

  // Handle the ?canvas= flag from a full-page-redirect fallback (popup blocked).
  useEffect(() => {
    if (handledFlag.current) return;
    const flag = new URLSearchParams(window.location.search).get("canvas");
    if (!flag) return;
    handledFlag.current = true;
    if (flag === "connected") toast("Canvas connected", "success");
    else if (flag === "denied")
      toast("Canvas wasn't connected. You can try again anytime.", "error");
    else toast("Couldn't connect Canvas. Please try again.", "error");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSync() {
    const counts = await sync();
    if (counts) {
      setSyncedLabel("Synced just now");
      setTimeout(() => setSyncedLabel(null), 4000);
    }
  }

  if (loading && !status) {
    return <p className="text-sm text-muted-foreground">Checking Canvas…</p>;
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
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Connect Canvas</p>
              <p className="text-sm text-muted-foreground">
                Automatically bring your courses, assignments and deadlines into LifeOS.
              </p>
            </div>
          </div>
          <ConnectCanvas
            status={status}
            busy={busy}
            onConnect={(url) => connect(url, "settings")}
            onConnectToken={connectWithToken}
          />
        </>
      )}

      {connected && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  needsReauth || errored
                    ? "bg-warning/15 text-warning"
                    : "bg-primary/15 text-primary",
                )}
              >
                {needsReauth || errored ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="flex items-center gap-2 font-medium">
                  Canvas
                  <Badge tone={needsReauth || errored ? "warning" : "success"}>
                    {needsReauth ? "Reconnect needed" : errored ? "Sync issue" : "Connected"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {status?.school ? `${status.school} · ` : ""}
                  {status?.canvasUserName ?? "Your Canvas account"}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Last synced</p>
              <p className="font-medium text-foreground">
                {syncedLabel ?? timeAgo(status?.lastSyncedAt)}
              </p>
            </div>
          </div>

          {status?.message && (
            <p className="text-sm text-warning">{status.message}</p>
          )}

          {needsReauth ? (
            <div className="space-y-2.5">
              <p className="text-sm text-muted-foreground">
                Your Canvas authorization expired. Reconnect to keep your courses and
                assignments in sync.
              </p>
              <ConnectCanvas
                status={status}
                busy={busy}
                onConnect={(url) => connect(url, "settings")}
                onConnectToken={connectWithToken}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} loading={syncing}>
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing Canvas…" : errored ? "Try again" : "Sync now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={canvas.openCoursePicker}
                disabled={busy || canvas.coursePicker.loading}
              >
                <GraduationCap className="h-4 w-4" /> Choose courses
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnect(true)}
                disabled={busy}
              >
                <Plug className="h-4 w-4" /> Disconnect Canvas
              </Button>
            </div>
          )}
        </>
      )}

      <CanvasCoursePicker canvas={canvas} />

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
      title="Disconnect Canvas?"
      description="LifeOS will stop syncing with Canvas and your stored access will be revoked."
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">What should happen to Canvas-imported items?</p>
        {(
          [
            {
              id: "keep" as const,
              title: "Keep them in LifeOS",
              blurb: "Courses, assignments and tasks stay, but stop updating from Canvas.",
            },
            {
              id: "remove" as const,
              title: "Remove Canvas-imported items",
              blurb: "Deletes Canvas courses, assignments, tasks and events. Your own items are untouched.",
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
