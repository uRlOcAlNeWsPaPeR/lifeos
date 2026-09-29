"use client";

import { useEffect, useState } from "react";
import { Check, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/store/app-data";
import { PATCH_NOTES, LATEST_PATCH_VERSION } from "@/lib/patch-notes";

// "What's new" shows once per release, the first time a student opens LifeOS
// after an update — persisted (not session-scoped) so it doesn't repeat in
// this browser.
const PATCH_SEEN_KEY = "lifeos.patchnotes.seen";

function hasUnseenPatchNotes(): boolean {
  if (!LATEST_PATCH_VERSION) return false;
  try {
    return localStorage.getItem(PATCH_SEEN_KEY) !== LATEST_PATCH_VERSION;
  } catch {
    return false;
  }
}
function markPatchNotesSeen() {
  try {
    localStorage.setItem(PATCH_SEEN_KEY, LATEST_PATCH_VERSION);
  } catch {
    /* private mode */
  }
}

export function WhatsNew() {
  const { data, ready } = useAppData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ready && data.profile.onboarded && hasUnseenPatchNotes()) setOpen(true);
  }, [ready, data.profile.onboarded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    markPatchNotesSeen();
    setOpen(false);
  }

  if (!open || !PATCH_NOTES[0]) return null;
  return <PatchNotes note={PATCH_NOTES[0]} onClose={close} />;
}

function PatchNotes({
  note,
  onClose,
}: {
  note: (typeof PATCH_NOTES)[number];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="What's new in LifeOS"
        className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-popover/95 shadow-glow-lg backdrop-blur-2xl animate-slide-up sm:rounded-3xl sm:animate-scale-in"
      >
        <div className="relative shrink-0 bg-gradient-to-b from-primary/12 to-transparent px-7 pt-7 pb-6">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow-sm">
            <Rocket className="h-5 w-5" />
          </div>

          <p className="mt-4 text-sm text-muted-foreground">What&apos;s new</p>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{note.title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {new Date(note.date).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto scrollbar-thin px-7 py-5">
          {note.items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <p className="text-sm">{item}</p>
            </div>
          ))}
        </div>

        <div className="pb-safe flex shrink-0 items-center justify-end border-t border-white/[0.06] px-7 py-4">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
