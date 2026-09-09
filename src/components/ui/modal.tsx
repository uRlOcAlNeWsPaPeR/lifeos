"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared across every mounted <Modal> so a nested one (e.g. a confirm opened from
// inside another dialog) doesn't unlock body scroll while the outer is still up.
let scrollLocks = 0;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Portal target — only exists in the browser. Guards SSR / first render.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Rendered on document.body so an ancestor's `transform` (page fade-in
  // animation, card hovers, …) can't turn `position: fixed` into
  // `position: absolute` and drop the dialog to the bottom of a long page.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto scrollbar-thin rounded-2xl border border-white/10 bg-popover/95 p-5 shadow-glow-lg backdrop-blur-xl animate-scale-in",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
