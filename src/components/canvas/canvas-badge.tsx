"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Small, quiet marker for anything that came from Canvas. Uses the existing LifeOS
 * visual language (dark surface, primary accent) — it's an indicator, not a rebrand.
 */
export function CanvasBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary",
        className,
      )}
    >
      <CanvasGlyph className="h-2.5 w-2.5" />
      Canvas
    </span>
  );
}

const SKIP_KEY = "lifeos:canvas-open-no-prompt";

function skipPrompt(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Force Canvas to re-run its login (→ Google account picker) instead of reusing
 *  whatever session — right or wrong — is already there. */
function canvasDeepLink(raw: string): string {
  try {
    const u = new URL(raw);
    u.searchParams.set("force_login", "1");
    return u.toString();
  } catch {
    return raw;
  }
}

function openCanvas(url: string) {
  window.open(canvasDeepLink(url), "_blank", "noopener,noreferrer");
}

/** "Open in Canvas" deep link. Renders nothing without a URL. */
export function OpenInCanvas({
  url,
  className,
  compact,
}: {
  url: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const [prompting, setPrompting] = useState(false);
  if (!url) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (skipPrompt()) openCanvas(url);
    else setPrompting(true);
  };

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary",
          className,
        )}
        title="Open in Canvas"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {!compact && "Open in Canvas"}
      </a>

      <CanvasOpenPrompt
        open={prompting}
        onClose={() => setPrompting(false)}
        onConfirm={() => {
          setPrompting(false);
          openCanvas(url);
        }}
      />
    </>
  );
}

function CanvasOpenPrompt({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);

  const confirm = () => {
    if (dontAsk) {
      try {
        localStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* private mode — just skip persisting */
      }
    }
    onConfirm();
  };

  return (
    <Modal open={open} onClose={onClose} title="Opening Canvas">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Canvas signs in with Google. If you&apos;re signed into more than one Google
          account in this browser, choose your{" "}
          <span className="font-medium text-foreground">school</span> account on the next
          screen — a personal Gmail won&apos;t have your classes.
        </p>

        <a
          href="https://accounts.google.com/AccountChooser"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Check or switch your Google account first
        </a>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Don&apos;t remind me again on this device
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open Canvas
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CanvasGlyph({ className }: { className?: string }) {
  // Simple dotted mark evoking Canvas's logo — no trademarked asset.
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="currentColor">
      <circle cx="8" cy="2.2" r="1.5" />
      <circle cx="8" cy="13.8" r="1.5" />
      <circle cx="2.2" cy="8" r="1.5" />
      <circle cx="13.8" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  );
}
