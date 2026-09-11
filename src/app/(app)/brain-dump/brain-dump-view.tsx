"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Check,
  Clock,
  Lightbulb,
  Lock,
  X,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea, Input } from "@/components/ui/input";
import { BrainDumpLoader } from "@/components/app/brain-dump-loader";
import { UpgradeAd } from "@/components/app/upgrade-ad";
import { authedApi } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import { useAppData } from "@/lib/store/app-data";
import { fmtDuration, toInputDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

interface AiItem {
  title: string;
  notes: string | null;
  category: string | null;
  suggestedPriority: (typeof PRIORITIES)[number];
  suggestedDueAt: string | null;
  dueDateWasExplicit: boolean;
  estimatedMinutes: number | null;
  suggestedSlot: string | null;
  reasoning: string | null;
}

const EXAMPLE =
  "I have a history test Friday on the French Revolution, Napoleon and the Congress of Vienna. English essay due Monday about symbolism in The Great Gatsby. Need to email my counselor and work on my coding project tonight.";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Phase = "input" | "loading" | "review";

interface DraftItem {
  id: string;
  title: string;
  notes: string;
  category: string;
  priority: (typeof PRIORITIES)[number];
  due: string;
  dueWasExplicit: boolean;
  minutes: number | null;
  slot: string;
  reason: string;
  keep: boolean; // decided during review
}

function toDraft(i: AiItem): DraftItem {
  return {
    id: rid(),
    title: i.title,
    notes: i.notes ?? "",
    category: i.category ?? "",
    priority: i.suggestedPriority,
    due: toInputDate(i.suggestedDueAt),
    dueWasExplicit: i.dueDateWasExplicit,
    minutes: i.estimatedMinutes,
    slot: i.suggestedSlot ?? "",
    reason: i.reasoning ?? "",
    keep: true,
  };
}

export function BrainDumpView() {
  const { data, commitBrainDump } = useAppData();
  const engineLabel = data.ai.label;
  const weeklyLimit = data.limits.brainDumpsPerWeek;

  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usedThisWeek, setUsedThisWeek] = useState(data.limits.brainDumpsUsedThisWeek);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [step, setStep] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [engineUsed, setEngineUsed] = useState<string | null>(null);
  // guards against a double request (fast double-click, click + Cmd-Enter, StrictMode)
  const inFlight = useRef(false);

  const atLimit = weeklyLimit !== null && usedThisWeek >= weeklyLimit;
  const remaining = weeklyLimit === null ? null : Math.max(0, weeklyLimit - usedThisWeek);

  async function organize() {
    if (text.trim().length < 3 || atLimit || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase("loading");
    const started = Date.now();
    const settle = () => new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))));
    try {
      const res = await authedApi<{ items: AiItem[]; engine?: string }>("/api/brain-dump", {
        method: "POST",
        body: { text },
      });
      await settle();
      if (!res.items?.length) {
        setPhase("input");
        setError("I couldn't find any tasks in that. Add a bit more detail and try again.");
        return;
      }
      setUsedThisWeek((n) => n + 1);
      setEngineUsed(res.engine ?? null);
      setItems(res.items.map(toDraft));
      setStep(0);
      setPhase("review");
    } catch (e) {
      await settle();
      setPhase("input");
      setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally {
      inFlight.current = false;
    }
  }

  function patchCurrent(p: Partial<DraftItem>) {
    setItems((cur) => cur.map((it, i) => (i === step ? { ...it, ...p } : it)));
  }

  function decide(keep: boolean) {
    setItems((cur) => cur.map((it, i) => (i === step ? { ...it, keep } : it)));
    if (step + 1 < items.length) {
      setStep(step + 1);
    } else {
      finish(items.map((it, i) => (i === step ? { ...it, keep } : it)));
    }
  }

  function cancel() {
    setItems([]);
    setStep(0);
    setError(null);
    setPhase("input");
  }

  async function finish(final: DraftItem[]) {
    if (inFlight.current) return;
    const kept = final.filter((i) => i.keep);
    if (!kept.length) {
      toast("No tasks added.", "info");
      cancel();
      return;
    }
    inFlight.current = true;
    setCommitting(true);
    try {
      const count = await commitBrainDump(
        kept.map((it) => ({
          title: it.title,
          category: it.category || null,
          priority: it.priority,
          dueAt: it.due || null,
          estimatedMinutes: it.minutes,
          notes:
            [
              it.notes.trim() || null,
              it.slot ? `Suggested time: ${it.slot}` : null,
              it.reason ? `Why: ${it.reason}` : null,
            ]
              .filter(Boolean)
              .join("\n\n") || null,
        })),
        text,
      );
      toast(`Added ${count} task${count === 1 ? "" : "s"} ✓`, "success");
      setText("");
      cancel();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", "error");
      setCommitting(false);
    } finally {
      inFlight.current = false;
    }
  }

  /* ---------------- LOADING ---------------- */
  if (phase === "loading") return <BrainDumpLoader />;

  /* ---------------- REVIEW (one at a time) ---------------- */
  if (phase === "review" && items[step]) {
    const it = items[step];
    const kept = items.filter((i) => i.keep).length;

    return (
      <div className="mx-auto max-w-md animate-fade-in">
        {/* progress + close */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {items.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted",
                )}
              />
            ))}
          </div>
          <button
            onClick={cancel}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Task {step + 1} of {items.length}</span>
          <span>
            {items.length} task{items.length === 1 ? "" : "s"} ·{" "}
            {engineUsed === "gemini"
              ? "organized by Gemini"
              : engineUsed === "anthropic"
                ? "organized by Claude"
                : "organized by LifeOS's offline engine"}
          </span>
        </p>

        <Card key={it.id} className="animate-scale-in p-5">
          {/* title */}
          <input
            value={it.title}
            onChange={(e) => patchCurrent({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && decide(true)}
            className="w-full bg-transparent text-lg font-semibold tracking-tight focus:outline-none"
            placeholder="Task name"
          />

          {/* priority pills */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Priority</p>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => patchCurrent({ priority: p })}
                  className={cn(
                    "flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors",
                    it.priority === p
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* time + date */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Time needed</p>
              <div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="number"
                  min={0}
                  value={it.minutes ?? ""}
                  onChange={(e) => patchCurrent({ minutes: e.target.value ? Number(e.target.value) : null })}
                  className="w-full bg-transparent text-sm focus:outline-none"
                  placeholder="—"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Due date{it.dueWasExplicit ? "" : " (optional)"}
              </p>
              <input
                type="date"
                value={it.due}
                onChange={(e) => patchCurrent({ due: e.target.value })}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* suggested time hint */}
          {it.slot && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-primary">
              <Lightbulb className="h-3.5 w-3.5" />
              Best time: {it.slot}
            </p>
          )}

          {/* notes — what the AI folded into this one task (topics / prompt) */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Details</p>
            <Textarea
              rows={it.notes ? 3 : 2}
              value={it.notes}
              onChange={(e) => patchCurrent({ notes: e.target.value })}
              placeholder="Topics it covers, the prompt, instructions…"
              className="text-sm"
            />
          </div>

          {/* details (reason + category) — tucked away */}
          <Details item={it} onChange={patchCurrent} />
        </Card>

        {/* actions */}
        <div className="mt-4 flex items-center gap-3">
          <Button variant="ghost" onClick={() => decide(false)} disabled={committing} className="flex-1">
            Skip
          </Button>
          <Button onClick={() => decide(true)} loading={committing} className="flex-[2]">
            <Check className="h-4 w-4" />
            {step + 1 === items.length ? `Add & finish` : "Add"}
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {kept} added so far · nothing is saved until you finish
        </p>
      </div>
    );
  }

  /* ---------------- INPUT ---------------- */
  return (
    <div className="animate-fade-in">
      <UpgradeAd feature="Brain Dump" />
      <PageHeader
        title="Brain Dump"
        description="Type everything on your mind. LifeOS turns it into tasks you review one by one."
        action={
          remaining !== null ? (
            <Badge tone={remaining === 0 ? "destructive" : "muted"}>{remaining} left this week</Badge>
          ) : null
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm animate-fade-in">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1 text-muted-foreground">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="p-5">
        <Textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          disabled={atLimit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") organize();
          }}
        />
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setText(EXAMPLE)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Use an example
          </button>
          <Button onClick={organize} disabled={atLimit || text.trim().length < 3}>
            <Brain className="h-4 w-4" /> Organize
          </Button>
        </div>
        {atLimit && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <Lock className="h-4 w-4 text-warning" />
            <span>
              You&apos;ve used your {weeklyLimit} Brain Dump{weeklyLimit === 1 ? "" : "s"} for this
              week.{" "}
              <Link href="/settings" className="font-medium text-primary hover:underline">
                Upgrade to Student+
              </Link>{" "}
              for more.
            </span>
          </div>
        )}
        <p className="mt-2 text-right text-[11px] text-muted-foreground">Powered by {engineLabel}</p>
      </Card>
    </div>
  );
}

function Details({
  item,
  onChange,
}: {
  item: DraftItem;
  onChange: (p: Partial<DraftItem>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide" : "More"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Subject</p>
            <Input
              value={item.category}
              onChange={(e) => onChange({ category: e.target.value })}
              placeholder="e.g. Physics"
              className="h-9"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Best time to work on it</p>
            <Input
              value={item.slot}
              onChange={(e) => onChange({ slot: e.target.value })}
              placeholder="e.g. Tonight 7–9pm"
              className="h-9"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Why this priority</p>
            <Textarea
              rows={2}
              value={item.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
