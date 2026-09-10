"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardDTO, GameMode } from "@/lib/types";

/** What every game hands back when the student finishes or quits. */
export interface GameResult {
  /** The deck's cards, with spaced-repetition state updated by the session. */
  cards: CardDTO[];
  mode: GameMode;
  right: number;
  wrong: number;
  /** Rush only — points scored. */
  score?: number;
  /** Match only — how long the board took to clear. */
  elapsedMs?: number;
  /** True when the student bailed out early; the session still counts. */
  abandoned?: boolean;
}

export interface GameProps {
  cards: CardDTO[];
  onFinish: (result: GameResult) => void;
  onExit: () => void;
}

/**
 * The frame every game runs inside: a title, a quit button, and a progress rail.
 * Keeping this shared means each game file is only its own rules.
 */
export function GameShell({
  title,
  subtitle,
  progress,
  onExit,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  /** 0–1. Omit for games with no linear progress. */
  progress?: number;
  onExit: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {right}
          <button
            onClick={onExit}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="End session"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {progress !== undefined && (
        <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-brand transition-all duration-500 ease-out"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
          />
        </div>
      )}

      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Shown when a game ends. Same layout for all four modes. */
export function GameSummary({
  title,
  stats,
  onReplay,
  onDone,
}: {
  title: string;
  stats: { label: string; value: string; tone?: "good" | "bad" | "neutral" }[];
  onReplay: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto max-w-md animate-pop text-center">
      <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>

      <dl className="mt-7 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
            <dd
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums",
                s.tone === "good" && "text-success",
                s.tone === "bad" && "text-warning",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex justify-center gap-2">
        <Button variant="outline" onClick={onDone}>
          Back to deck
        </Button>
        <Button onClick={onReplay}>Play again</Button>
      </div>
    </div>
  );
}

/** mm:ss for the timed games. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
