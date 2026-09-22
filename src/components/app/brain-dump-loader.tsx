"use client";

import { useEffect, useState } from "react";

const STEPS = ["Reading your notes", "Finding the tasks", "Sorting by priority", "Almost ready"];
const IMAGE_STEPS = ["Reading the screenshot", "Finding the assignments", "Sorting by due date", "Almost ready"];

/**
 * Full-screen, on-brand loading state for Brain Dump (and the assignment
 * screenshot importer, which shares this same visual). Covers the whole app
 * (sidebar included), uses the LifeOS primary palette, and never reads as an
 * error or a separate page.
 */
export function BrainDumpLoader({ source = "text" }: { source?: "text" | "image" }) {
  const [step, setStep] = useState(0);
  const steps = source === "image" ? IMAGE_STEPS : STEPS;

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1600);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-background/85 backdrop-blur-2xl animate-fade-in">
      {/* themed glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 40% at 50% 42%, hsl(var(--glow) / 0.22), transparent 72%)",
        }}
      />

      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20" />
        <span className="absolute inline-flex h-24 w-24 rounded-full border border-white/10" />
        <span
          className="absolute inline-flex h-24 w-24 animate-spin rounded-full [animation-duration:1.2s]"
          style={{
            background: "conic-gradient(from 0deg, transparent 55%, var(--g-green), var(--g-teal))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
          }}
        />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-ai text-white shadow-glow">
          <svg viewBox="0 0 24 24" className="h-6 w-6 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 7l8-4 8 4-8 4-8-4z" strokeLinejoin="round" />
            <path d="M4 12l8 4 8-4M4 17l8 4 8-4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      <p key={step} className="relative mt-8 animate-fade-in text-sm font-medium text-muted-foreground">
        {steps[step]}…
      </p>

      <div className="relative mt-5 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-gradient-ai" />
      </div>
    </div>
  );
}
