"use client";

import { useLayoutEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fixMathHTML } from "@/lib/sat/math-fix";
import { DIFF_NAME, SECTION_NAME } from "@/lib/sat/constants";
import type { Difficulty, Question, Section } from "@/lib/sat/types";
import { cn } from "@/lib/utils";

/**
 * The light test sheet question content sits on. Uses LifeOS's own light
 * palette (`.theme-light`), because College Board figures are black lines on a
 * transparent background and disappear against the dark theme.
 */
export function Sheet({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("theme-light sat-sheet rounded-2xl border border-border p-5 shadow-sm sm:p-6", className)}
      {...props}
    />
  );
}

/**
 * College Board question HTML. Injected by hand rather than through React so
 * the MathML repairs (which rewrite nodes) can run on it without React fighting
 * them on the next render.
 */
export function QuestionHtml({
  html,
  className,
  as: Tag = "div",
}: {
  html: string | undefined;
  className?: string;
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLDivElement & HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html ?? "";
    fixMathHTML(ref.current);
  }, [html]);
  return <Tag ref={ref} className={cn("sat-content", className)} />;
}

export const DIFF_TONE: Record<Difficulty, "success" | "warning" | "destructive"> = {
  E: "success",
  M: "warning",
  H: "destructive",
};

export function DifficultyBadge({ d }: { d: Difficulty }) {
  return <Badge tone={DIFF_TONE[d]}>{DIFF_NAME[d]}</Badge>;
}

export function sectionName(s: Section) {
  return SECTION_NAME[s];
}

/** Section · skill · difficulty · College Board ID. */
export function QuestionMeta({ q, qid }: { q: Question; qid?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone="muted">{SECTION_NAME[q.section]}</Badge>
      <Badge tone="muted">{q.skillDesc}</Badge>
      <DifficultyBadge d={q.difficulty} />
      {qid && <span className="font-mono text-muted-foreground">ID {qid}</span>}
    </div>
  );
}

export type OptionState = "idle" | "selected" | "correct" | "wrong";

export const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * One multiple-choice answer. Clicking the choice selects it; the letter
 * button beside it crosses it out — the same split the real test uses.
 * Rendered inside a `Sheet`, so its colours come from the light palette.
 */
export function OptionRow({
  letter,
  html,
  state,
  crossed = false,
  disabled = false,
  onSelect,
  onCross,
}: {
  letter: string;
  html: string;
  state: OptionState;
  crossed?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onCross?: () => void;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled || !onSelect}
        aria-pressed={state === "selected"}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors",
          state === "idle" && "border-border hover:border-foreground/40",
          state === "selected" && "border-foreground bg-secondary",
          state === "correct" && "border-success bg-success/10",
          state === "wrong" && "border-destructive bg-destructive/10",
          crossed && "opacity-45",
          (disabled || !onSelect) && "cursor-default",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
            state === "idle" && "border-border",
            state === "selected" && "border-foreground bg-foreground text-background",
            state === "correct" && "border-success bg-success text-success-foreground",
            state === "wrong" && "border-destructive bg-destructive text-destructive-foreground",
          )}
        >
          {state === "correct" ? <Check className="h-3.5 w-3.5" /> : state === "wrong" ? <X className="h-3.5 w-3.5" /> : letter}
        </span>
        <QuestionHtml html={html} className={cn("min-w-0 pt-0.5", crossed && "line-through")} />
      </button>
      {onCross && (
        <button
          type="button"
          onClick={onCross}
          disabled={disabled}
          aria-pressed={crossed}
          aria-label={crossed ? `Restore choice ${letter}` : `Cross out choice ${letter}`}
          title={crossed ? "Restore this choice" : "Cross out this choice"}
          className={cn(
            "flex w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors",
            crossed
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40",
            disabled && "opacity-40",
          )}
        >
          <span className={cn(!crossed && "line-through")}>{letter}</span>
        </button>
      )}
    </div>
  );
}
