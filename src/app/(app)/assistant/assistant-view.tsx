"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  RotateCcw,
  ArrowLeft,
  History,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MiniMarkdown } from "@/components/app/mini-markdown";
import { UpgradeAd } from "@/components/app/upgrade-ad";
import { useAppData } from "@/lib/store/app-data";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { getLastPage } from "@/lib/last-page";
import { timeAgo } from "@/lib/format";
import {
  useAssistantChat,
  type AssistantReference,
  type ActionStatus,
  type Conversation,
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

/**
 * The AI Assistant is its own full-bleed screen, reached only from the
 * sidebar — same idea as the Core: no rail, just the thing itself. It always
 * opens on a fresh chat; past chats (30-day retention) live in the history
 * panel, one click away. "Exit AI" hands back to whatever page the student
 * was actually on before, not always the dashboard.
 */
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
  const router = useRouter();
  const chat = useAssistantChat();
  const stage = useStagePointer<HTMLDivElement>();
  const {
    turns,
    input,
    setInput,
    loading,
    hydrated,
    used,
    perDay,
    actionStatus,
    setActionStatus,
    ask,
    conversations,
    activeId,
    startNew,
    openConversation,
    deleteConversation,
  } = chat;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const exitHref = useRef(getLastPage()).current;

  const remaining = perDay === null ? null : Math.max(0, perDay - used);
  const atLimit = remaining === 0;
  const booting = !minTimeDone || !hydrated;

  // A short showcase beat so entering the Assistant always feels like
  // something is happening, even when history loads instantly.
  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 650);
    return () => clearTimeout(t);
  }, []);

  // Always land on a fresh chat — resuming an old one is an explicit click in
  // the history panel. Skipped only if a reply is actively in flight (e.g.
  // the student bounced to another page and back mid-answer).
  useEffect(() => {
    if (!loading) startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: turns.length > 1 ? "smooth" : "auto" });
  }, [turns, loading]);

  function submit(question: string) {
    if (!question.trim() || loading || atLimit) return;
    void ask(question);
  }

  function pickConversation(id: string) {
    openConversation(id);
    setHistoryOpen(false);
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

  if (booting) return <BootingScreen />;

  return (
    <div ref={stage} className="relative flex h-[100svh] overflow-hidden bg-background">
      <UpgradeAd feature="The AI Assistant" />

      {/* cursor-follow ambient light — same treatment as the Core */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 -z-10 h-[900px] w-[900px] rounded-full motion-reduce:hidden"
        style={{
          background: "radial-gradient(circle, hsl(var(--glow)/0.09), transparent 62%)",
          transform:
            "translate3d(calc(var(--mxpx,50vw) - 450px), calc(var(--mypx,35vh) - 450px), 0)",
          willChange: "transform",
        }}
      />

      <HistoryPanel
        conversations={conversations}
        activeId={activeId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNew={() => {
          startNew();
          setHistoryOpen(false);
        }}
        onOpen={pickConversation}
        onDelete={deleteConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* top bar */}
        <div className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(exitHref)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-foreground/90 backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit AI
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="Chat history"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground/90 backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary lg:hidden"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {turns.length > 0 && (
              <Button size="sm" variant="ghost" onClick={startNew} disabled={loading}>
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </Button>
            )}
            {remaining !== null && (
              <Badge tone={remaining === 0 ? "warning" : "muted"}>{remaining} left today</Badge>
            )}
            <Badge tone="muted">{engineLabel}</Badge>
          </div>
        </div>

        {/* chat column */}
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 pb-4">
          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto py-2">
            {turns.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg animate-[glow-breathe_3.5s_ease-in-out_infinite]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="mt-5 text-lg font-medium">Hey {name}, what do you need?</p>
                <p className="mt-1 text-sm text-muted-foreground">Working with {dataHint}</p>
                <div className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/40 hover:text-foreground"
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
                  className={cn(
                    "flex animate-slide-up",
                    turn.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5",
                      turn.role === "user"
                        ? "bg-gradient-brand text-white shadow-glow-sm"
                        : "border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl",
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
                                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-foreground/90 hover:bg-white/10"
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
            {loading && <ThinkingBubble />}
          </div>

          {atLimit ? (
            <div className="mt-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-center text-sm text-muted-foreground backdrop-blur-xl">
              You&apos;ve used all {perDay} AI Assistant questions for today.{" "}
              <Link href="/settings?tab=plan" className="font-medium text-primary hover:underline">
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
              className="mt-2 flex gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2 backdrop-blur-xl"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask, or tell it to add / remove something…"
                className="border-none bg-transparent focus-visible:ring-0"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** A brief "waking up" beat before the chat appears — an orb spinning up,
 *  same visual language as the Core. */
function BootingScreen() {
  return (
    <div className="relative flex h-[100svh] flex-col items-center justify-center overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 45%, hsl(var(--glow)/0.14), transparent 60%)",
        }}
      />
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <span
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary"
          style={{ animationDuration: "1s" }}
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg animate-[glow-breathe_1.4s_ease-in-out_infinite]">
          <Sparkles className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-5 animate-fade-in text-sm text-muted-foreground">Waking up the assistant…</p>
    </div>
  );
}

/** The "thinking" state — a small glowing orb with a staggered dot bounce,
 *  instead of a plain spinner. */
function ThinkingBubble() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Past chats, 30-day retention. A permanent column on desktop, a slide-over
 *  on narrower screens. */
function HistoryPanel({
  conversations,
  activeId,
  open,
  onClose,
  onNew,
  onOpen,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const body = (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.015] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm font-medium">Chats</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="scrollbar-thin mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {conversations.length === 0 ? (
          <div className="mt-8 flex flex-col items-center px-4 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground">
              Your chats will show up here once you send one.
            </p>
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-xl px-1 transition-colors",
                c.id === activeId ? "bg-primary/10" : "hover:bg-white/[0.04]",
              )}
            >
              <button
                onClick={() => onOpen(c.id)}
                className="min-w-0 flex-1 py-2.5 pl-2.5 text-left"
              >
                <p
                  className={cn(
                    "truncate text-sm",
                    c.id === activeId ? "font-medium text-primary" : "text-foreground/90",
                  )}
                >
                  {c.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {timeAgo(new Date(c.updatedAt).toISOString())}
                </p>
              </button>
              <button
                onClick={() => onDelete(c.id)}
                aria-label="Delete chat"
                className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-muted-foreground">
        Chats are kept for 30 days, then removed automatically.
      </p>
    </div>
  );

  return (
    <>
      {/* desktop: permanent column */}
      <div className="hidden lg:block">{body}</div>

      {/* mobile / tablet: slide-over */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
          <div className="relative h-full animate-slide-in-right">{body}</div>
        </div>
      )}
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
        destructive
          ? "border-destructive/30 bg-destructive/5"
          : "border-white/10 bg-white/[0.03]",
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
