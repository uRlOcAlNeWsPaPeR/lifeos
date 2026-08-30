"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Check, RefreshCw, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { authedApi } from "@/lib/client";
import { useAppData } from "@/lib/store/app-data";

interface Pick {
  taskId: string;
  title: string;
  reason: string;
}
type Engine = "heuristic" | "anthropic" | "gemini";
interface Result {
  intro: string;
  picks: Pick[];
  engine: Engine;
}

// Module-level cache so navigating away and back doesn't refetch when nothing changed.
let cache: { sig: string; result: Result } | null = null;

function signature(tasks: { id: string; status: string; priority: string; dueAt: string | null }[]) {
  return tasks
    .filter((t) => t.status !== "done")
    .map((t) => `${t.id}:${t.priority}:${t.dueAt ?? ""}`)
    .sort()
    .join("|");
}

export function AiPriorityPanel() {
  const { data, toggleTask } = useAppData();
  const sig = signature(data.tasks);

  const [loading, setLoading] = useState(!cache || cache.sig !== sig);
  const [result, setResult] = useState<Result | null>(cache?.sig === sig ? cache.result : null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const inflight = useRef<string | null>(null);

  async function load(force = false) {
    if (!force && cache?.sig === sig) {
      setResult(cache.result);
      setLoading(false);
      return;
    }
    if (inflight.current === sig && !force) return;
    inflight.current = sig;
    setLoading(true);
    try {
      const res = await authedApi<Result>("/api/prioritize", { method: "POST" });
      cache = { sig, result: res };
      setResult(res);
    } finally {
      setLoading(false);
      inflight.current = null;
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  async function complete(taskId: string) {
    setDoneIds((s) => new Set(s).add(taskId));
    await toggleTask(taskId);
  }

  const picks = result?.picks ?? [];
  const engine = result?.engine ?? "heuristic";

  return (
    <Card glow className="h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-primary/12 via-transparent to-transparent px-6 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">AI Priority</h2>
          <Badge tone="ai" className="hidden sm:inline-flex">
            {engine === "anthropic" ? "Claude" : engine === "gemini" ? "Gemini" : "LifeOS engine"}
          </Badge>
        </div>
        <button
          onClick={() => load(true)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Refresh priorities"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
      </div>

      <div className="p-6">
        {loading && !result ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {result?.intro ?? "You're all caught up. Add tasks or run a Brain Dump."}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{result?.intro}</p>
            <ol className="mt-4 space-y-3">
              {picks.map((p, i) => (
                <li
                  key={p.taskId}
                  className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/15"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-ai text-xs font-semibold text-primary-foreground shadow-glow-sm">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
                  </div>
                  <button
                    onClick={() => complete(p.taskId)}
                    disabled={doneIds.has(p.taskId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/20 transition-all hover:border-primary hover:bg-primary/15 active:scale-90 disabled:border-primary disabled:bg-gradient-brand disabled:text-primary-foreground"
                    aria-label="Mark done"
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </button>
                </li>
              ))}
            </ol>
            <a
              href="/assistant"
              className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ask the assistant for a full plan <ArrowUpRight className="h-3 w-3" />
            </a>
          </>
        )}
      </div>
    </Card>
  );
}
