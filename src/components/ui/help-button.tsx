"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "ⓘ Why does LifeOS need this?" affordance. Click to toggle a small
 * on-brand popover. Closes on outside-click / Escape. Keyboard accessible.
 */
export function HelpButton({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More information"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full text-xs font-medium transition-colors",
          open ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Info className="h-3.5 w-3.5" />
        {title && <span>{title}</span>}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-popover/95 p-3.5 text-xs leading-relaxed text-muted-foreground shadow-glow-lg backdrop-blur-xl animate-scale-in"
        >
          {children}
        </div>
      )}
    </span>
  );
}
