"use client";

import { ScanSearch, Wand2, GraduationCap, ArrowRight } from "lucide-react";
import { useAppData } from "@/lib/store/app-data";
import { cn } from "@/lib/utils";

export type WritingTool = "detector" | "humanizer" | "coach";

export function Overview({ onOpen }: { onOpen: (tool: WritingTool) => void }) {
  const { data } = useAppData();
  const coachLeft =
    data.limits.essayCoachPerWeek == null
      ? null
      : Math.max(0, data.limits.essayCoachPerWeek - data.limits.essayCoachUsedThisWeek);

  const cards: {
    id: WritingTool;
    icon: typeof ScanSearch;
    name: string;
    desc: string;
    stat: string;
  }[] = [
    {
      id: "detector",
      icon: ScanSearch,
      name: "AI Detector",
      desc: "Paste an essay and get an AI-likelihood score with a per-sentence and per-paragraph breakdown.",
      stat: "Runs in your browser · nothing uploaded",
    },
    {
      id: "humanizer",
      icon: Wand2,
      name: "AI Humanizer",
      desc: "Rewrite the passages a detector flags — vocabulary, rhythm and punctuation only — with a before/after score.",
      stat: "Runs in your browser · unlimited",
    },
    {
      id: "coach",
      icon: GraduationCap,
      name: "Essay Coach",
      desc: "An AI reads your essay and returns scored feedback plus inline revision suggestions. It won't rewrite it for you.",
      stat:
        coachLeft == null
          ? "Feedback + inline suggestions"
          : `${coachLeft} coach run${coachLeft === 1 ? "" : "s"} left this week`,
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
          Writing
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Know the score before you turn it in.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Three tools for schoolwork you actually wrote — check how a detector reads it, tidy the
          parts that sound machine-made, and get real feedback on the draft.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={cn(
                "card-surface card-hover group flex flex-col p-4 text-left",
              )}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-sm">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight">{c.name}</p>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
              <span className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px] text-muted-foreground">
                {c.stat}
                <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
