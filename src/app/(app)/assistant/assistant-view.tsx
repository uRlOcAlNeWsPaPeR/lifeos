"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ListChecks,
  Target,
  GraduationCap,
  CalendarDays,
  Plus,
  Trash2,
  Check,
  X,
  CircleCheck,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MiniMarkdown } from "@/components/app/mini-markdown";
import { UpgradeAd } from "@/components/app/upgrade-ad";
import { useAppData } from "@/lib/store/app-data";
import {
  useAssistantChat,
  type AssistantReference,
  type ActionStatus,
} from "@/lib/assistant-chat";
import { cn } from "@/lib/utils";
import type { AssistantAction } from "@/lib/ai/types";

const SUGGESTIONS = [
  "What should I work on tonight?",
  "Add a task to study for my physics test Friday",
  "What assignments am I falling behind on?",
  "Add my AP Calc course",
  "Delete the task called laundry",
];

const REF_HREF: Record<AssistantReference["type"], string> = {
  task: "/tasks",
  goal: "/goals",
  assignment: "/school",
  course: "/school",
  event: "/calendar",
};
const REF_ICON = {
  task: ListChecks,
  goal: Target,
  assignment: GraduationCap,
  course: GraduationCap,
  event: CalendarDays,
};

const isDelete = (a: AssistantAction) => a.kind.startsWith("delete_");

export function AssistantView({
  name,
  engineLabel,
  dataHint,
}: {
  name: string;
  engineLabel: string;
  dataHint: string;
}) {
  const store = useAppData();
  const chat = useAssistantChat();
  const {
    turns,
    input,
    setInput,
    loading,
    used,
    perDay,
    actionStatus,
    setActionStatus,
    ask,
    clear,
    pruneIfStale,
  } = chat;

  const scrollRef = useRef<HTMLDivElement>(null);

  const remaining = perDay === null ? null : Math.max(0, perDay - used);
  const atLimit = remaining === 0;

  // Coming back to the page: drop the conversation if it's gone stale.
  useEffect(() => {
    pruneIfStale();
  }, [pruneIfStale]);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: turns.length > 1 ? "smooth" : "auto" });
  }, [turns, loading]);

  function submit(question: string) {
    if (!question.trim() || loading || atLimit) return;
    void ask(question);
  }

  async function runAction(key: string, a: AssistantAction) {
    setActionStatus(key, "working");
    try {
      const ok = await execute(store, a);
      setActionStatus(key, ok ? "done" : "error");
    } catch {
      setActionStatus(key, "error");
    }
  }

  return (
    <>
      <UpgradeAd feature="The AI Assistant" />
      <PageHeader
        title="AI Assistant"
        description="Ask about your tasks, deadlines and goals — or tell it to add and remove things for you. It works from your LifeOS data, not the open web."
        action={
          <div className="flex items-center gap-2">
            {turns.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clear} disabled={loading}>
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </Button>
            )}
            {remaining !== null && (
              <Badge tone={remaining === 0 ? "warning" : "muted"}>{remaining} left today</Badge>
            )}
            <Badge tone="muted">{engineLabel}</Badge>
          </div>
        }
      />

      <Card glow className="flex h-[calc(100svh-230px)] min-h-[420px] flex-col overflow-hidden">
        <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {turns.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-3 font-medium">Hey {name}, what do you need?</p>
              <p className="mt-1 text-sm text-muted-foreground">Working with {dataHint}</p>
              <div className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn, i) => (
              <div
                key={i}
                className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5",
                    turn.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card",
                  )}
                >
                  {turn.role === "assistant" ? (
                    <>
                      <MiniMarkdown text={turn.content} />
                      {turn.references && turn.references.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {turn.references.map((r) => {
                            const Icon = REF_ICON[r.type];
                            return (
                              <Link
                                key={`${r.type}-${r.id}`}
                                href={REF_HREF[r.type]}
                                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
                              >
                                <Icon className="h-3 w-3" />
                                {r.title}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      {turn.actions && turn.actions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {turn.actions.map((a, j) => {
                            const key = `${i}:${j}`;
                            return (
                              <ActionCard
                                key={key}
                                action={a}
                                status={actionStatus[key] ?? "idle"}
                                onRun={() => runAction(key, a)}
                                onDismiss={() => setActionStatus(key, "dismissed")}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">{turn.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        {atLimit ? (
          <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
            You&apos;ve used all {perDay} AI Assistant questions for today.{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Upgrade
            </Link>{" "}
            for more.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask, or tell it to add / remove something…"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}

function ActionCard({
  action,
  status,
  onRun,
  onDismiss,
}: {
  action: AssistantAction;
  status: ActionStatus;
  onRun: () => void;
  onDismiss: () => void;
}) {
  const destructive = isDelete(action);
  const Icon = useMemo(
    () => (destructive ? Trash2 : action.kind === "complete_task" ? CircleCheck : Plus),
    [destructive, action.kind],
  );

  if (status === "dismissed") return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border p-2.5 text-sm",
        destructive ? "border-destructive/30 bg-destructive/5" : "border-border bg-background/40",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", destructive ? "text-destructive" : "text-primary")} />
      <span className="min-w-0 flex-1">{action.label}</span>

      {status === "done" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <Check className="h-3.5 w-3.5" />
          {destructive ? "Removed" : action.kind === "complete_task" ? "Marked done" : "Added"}
        </span>
      ) : status === "error" ? (
        <span className="text-xs font-medium text-destructive">Didn&apos;t work — try the page</span>
      ) : (
        <span className="flex gap-1.5">
          <Button
            size="sm"
            variant={destructive ? "destructive" : "primary"}
            loading={status === "working"}
            onClick={onRun}
          >
            {destructive ? "Delete" : action.kind === "complete_task" ? "Do it" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={status === "working"}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      )}
    </div>
  );
}

/** Run one confirmed action through the app store. Returns false on a soft failure. */
async function execute(
  store: ReturnType<typeof useAppData>,
  a: AssistantAction,
): Promise<boolean> {
  switch (a.kind) {
    case "add_task":
      return Boolean(
        await store.addTask({
          title: a.title,
          dueAt: a.dueAt,
          priority: a.priority,
          notes: a.notes,
          courseId: a.courseId,
          source: "assistant",
        }),
      );
    case "add_course":
      return Boolean(
        await store.addCourse({ name: a.name, code: a.code, instructor: a.instructor }),
      );
    case "add_assignment":
      return Boolean(
        await store.addAssignment({
          courseId: a.courseId,
          title: a.title,
          dueAt: a.dueAt,
          pointsPossible: a.pointsPossible,
        }),
      );
    case "complete_task":
      await store.toggleTask(a.id);
      return true;
    case "delete_task":
      await store.deleteTask(a.id);
      return true;
    case "delete_course":
      await store.deleteCourse(a.id);
      return true;
    case "delete_assignment":
      await store.deleteAssignment(a.id);
      return true;
  }
}
