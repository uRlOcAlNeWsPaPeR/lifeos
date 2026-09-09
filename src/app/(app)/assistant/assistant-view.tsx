"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, ListChecks, Target, GraduationCap, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MiniMarkdown } from "@/components/app/mini-markdown";
import { authedApi } from "@/lib/client";
import { cn } from "@/lib/utils";

interface Reference {
  type: "task" | "goal" | "assignment" | "course" | "event";
  id: string;
  title: string;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
  engine?: string;
}

const SUGGESTIONS = [
  "What should I work on tonight?",
  "When should I study for my physics test?",
  "What assignments am I falling behind on?",
  "Make me a study plan for this week.",
  "How are my goals doing?",
];

const REF_HREF: Record<Reference["type"], string> = {
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

export function AssistantView({
  name,
  engineLabel,
  dataHint,
  perDay,
  usedToday,
}: {
  name: string;
  engineLabel: string;
  dataHint: string;
  perDay: number | null;
  usedToday: number;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [used, setUsed] = useState(usedToday);
  const scrollRef = useRef<HTMLDivElement>(null);

  const remaining = perDay === null ? null : Math.max(0, perDay - used);
  const atLimit = remaining === 0;

  async function ask(question: string) {
    if (!question.trim() || loading || atLimit) return;
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await authedApi<{ answer: string; references: Reference[]; engine: string }>(
        "/api/assistant",
        { method: "POST", body: { question } },
      );
      setUsed((n) => n + 1);
      setTurns((t) => [
        ...t,
        { role: "assistant", content: res.answer, references: res.references, engine: res.engine },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Something went wrong. Try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }), 50);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Ask about your LifeOS data — priorities, deadlines, study plans. It answers from your tasks, goals and courses, not the open web."
        action={
          <div className="flex items-center gap-2">
            {remaining !== null && (
              <Badge tone={remaining === 0 ? "warning" : "muted"}>
                {remaining} left today
              </Badge>
            )}
            <Badge tone="muted">{engineLabel}</Badge>
          </div>
        }
      />

      <Card glow className="flex h-[calc(100svh-230px)] min-h-[420px] flex-col overflow-hidden">
        <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {turns.length === 0 ? (
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
                    onClick={() => ask(s)}
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
              <div className="rounded-2xl border border-border bg-card px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
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
              ask(input);
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your tasks, deadlines or goals…"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
