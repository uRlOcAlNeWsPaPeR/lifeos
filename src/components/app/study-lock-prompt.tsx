"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock, Maximize } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useAppData } from "@/lib/store/app-data";
import {
  useStudyLock,
  fmtLeft,
  registerStudyLockPrompt,
  enterFocusFullscreen,
  exitFocusFullscreen,
} from "@/lib/study-lock";

// The nag. While a study session is live, this pops on every page and every
// in-app navigation until the student locks in — or picks "Don't show again",
// after which they can only get in by clicking the session itself.

const SNOOZES = [1, 5, 10]; // minutes
const NAG_INTERVAL_MS = 90_000;

export function StudyLockPrompt() {
  const { data } = useAppData();
  const lock = useStudyLock(data.events);
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  // Shown when the student escapes fullscreen mid-session — the only way past it
  // is to explicitly click "End session".
  const [escapePrompt, setEscapePrompt] = useState(false);

  // Any component can force it open (e.g. tapping a study session on the calendar).
  useEffect(() => {
    registerStudyLockPrompt(() => setManual(true));
    return () => registerStudyLockPrompt(null);
  }, []);

  // Auto-nag: reopen on every route change while a live session isn't handled.
  useEffect(() => {
    setOpen(lock.shouldPrompt);
  }, [lock.shouldPrompt, pathname]);

  // Keep nagging even if they stay on one page.
  useEffect(() => {
    if (!lock.shouldPrompt) return;
    const id = setInterval(() => setOpen(true), NAG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lock.shouldPrompt]);

  // "Remind me in N min" — fire again exactly when the snooze runs out.
  useEffect(() => {
    if (!lock.snoozeUntil) return;
    const ms = lock.snoozeUntil - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setOpen(true), ms + 150);
    return () => clearTimeout(id);
  }, [lock.snoozeUntil]);

  // A web page can't lock the OS or block tab-switching — but while locked in we
  // can notice when the student wanders off and call them back on return.
  useEffect(() => {
    if (lock.status !== "locked") return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        const away = Math.round((Date.now() - hiddenAt) / 1000);
        hiddenAt = 0;
        if (away > 3) {
          toast(
            `You left your study session for ${
              away < 60 ? `${away}s` : `${Math.round(away / 60)}m`
            } — get back to it.`,
            "error",
          );
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [lock.status]);

  // Locked in → the app takes over the screen. Bailing out of fullscreen throws
  // up the "are you sure?" gate.
  useEffect(() => {
    const onFsChange = () => {
      if (lock.status === "locked" && !document.fullscreenElement) setEscapePrompt(true);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [lock.status]);

  // Session over / paused / ended → drop the gate and hand the screen back.
  useEffect(() => {
    if (lock.status !== "locked") {
      setEscapePrompt(false);
      exitFocusFullscreen();
    }
  }, [lock.status]);

  const close = () => {
    setOpen(false);
    setManual(false);
  };

  const visible = (open || manual) && Boolean(lock.session) && lock.status !== "locked";
  if (!lock.session) return null;

  if (escapePrompt) {
    return (
      <Modal
        open
        onClose={() => {
          // Dismissing is NOT a way out — pull them back into fullscreen.
          setEscapePrompt(false);
          enterFocusFullscreen();
        }}
        title="Leave your study session?"
        description={`You're locked in — ${fmtLeft(lock.msLeft)} left.`}
        className="max-w-sm"
      >
        <p className="mt-1 text-sm text-muted-foreground">
          You just exited fullscreen. Get back to it, or end the session for good — those
          are the only options.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              lock.endSession();
              setEscapePrompt(false);
            }}
          >
            End session
          </Button>
          <Button
            onClick={() => {
              setEscapePrompt(false);
              enterFocusFullscreen();
            }}
          >
            <Maximize className="h-4 w-4" /> Stay locked in
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={visible}
      onClose={close}
      title={lock.resuming ? "Back to your study session?" : "Study session in progress"}
      description={`${lock.session.title || "Study session"} · ${fmtLeft(lock.msLeft)} left`}
      className="max-w-sm"
    >
      <p className="mt-1 text-sm text-muted-foreground">
        Lock in to focus — the Core stops opening and shows your time left instead. You can
        pause or end the session whenever you need to step away.
      </p>

      <div className="mt-5 space-y-3">
        <Button
          className="w-full"
          onClick={() => {
            lock.lockIn();
            enterFocusFullscreen();
            close();
          }}
        >
          <Lock className="h-4 w-4" /> Lock in
        </Button>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Remind me in</span>
          {SNOOZES.map((min) => (
            <button
              key={min}
              onClick={() => {
                lock.snooze(min);
                close();
              }}
              className="rounded-full border border-white/10 px-2.5 py-1 font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
            >
              {min} min
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => {
              lock.dismiss();
              close();
            }}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Don&apos;t show again
          </button>
          <button
            onClick={() => {
              lock.endSession();
              close();
            }}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            End session
          </button>
        </div>
      </div>
    </Modal>
  );
}
