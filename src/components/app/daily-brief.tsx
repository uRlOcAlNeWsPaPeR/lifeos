"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Moon,
  Sun,
  AlertTriangle,
  ListChecks,
  CalendarClock,
  Sparkles,
  Flame,
  Check,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppData } from "@/lib/store/app-data";
import { fmt12, hm } from "@/lib/scheduling/sleep";
import { greeting, isStaleOverdue, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";

const SEEN_KEY = "lifeos.brief.seen";
const MIN_GAP_MS = 5 * 60 * 60 * 1000; // don't re-pop within 5h of the same session

function shouldShow(): boolean {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return true;
    const last = new Date(raw);
    const now = new Date();
    if (last.toDateString() !== now.toDateString()) return true; // new day
    return now.getTime() - last.getTime() > MIN_GAP_MS;
  } catch {
    return true;
  }
}
function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* private mode */
  }
}

function isNight(bedtime: string, now: Date): boolean {
  const bed = hm(bedtime);
  const cur = now.getHours() * 60 + now.getMinutes();
  // bedtime in the evening (most common)
  if (bed >= 20 * 60) return cur >= bed || cur < 270; // before ~4:30am still "night"
  // bedtime after midnight
  return cur >= bed && cur < 12 * 60;
}

type Brief = {
  mode: "bedtime" | "overdue" | "today" | "upcoming" | "clear";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tasks: TaskDTO[];
  extra?: { label: string; value: string }[];
  cta: { label: string; href: string };
  tone: "warning" | "primary";
};

export function DailyBrief() {
  const { data, analytics, ready, toggleTask } = useAppData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ready && data.profile.onboarded && shouldShow()) setOpen(true);
  }, [ready, data.profile.onboarded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const brief = useMemo<Brief>(() => build(data, analytics), [data, analytics]);

  function close() {
    markSeen();
    setOpen(false);
  }

  if (!open) return null;
  const Icon = brief.icon;
  const name = data.profile.name.split(" ")[0] || "there";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Daily brief"
        className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-popover/95 shadow-glow-lg backdrop-blur-2xl animate-slide-up sm:rounded-3xl sm:animate-scale-in"
      >
        {/* header */}
        <div
          className={cn(
            "relative shrink-0 px-7 pt-7 pb-6",
            brief.tone === "warning"
              ? "bg-gradient-to-b from-warning/12 to-transparent"
              : "bg-gradient-to-b from-primary/12 to-transparent",
          )}
        >
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl",
              brief.tone === "warning"
                ? "bg-warning/15 text-warning"
                : "bg-gradient-brand text-primary-foreground shadow-glow-sm",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {brief.mode === "bedtime" ? "" : `${greeting()}, ${name} 👋`}
          </p>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{brief.title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{brief.subtitle}</p>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-7 py-5">
          {brief.extra && brief.extra.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {brief.extra.map((e) => (
                <div key={e.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                  <p className="text-lg font-semibold">{e.value}</p>
                  <p className="text-[11px] text-muted-foreground">{e.label}</p>
                </div>
              ))}
            </div>
          )}

          {brief.tasks.length > 0 ? (
            <ul className="space-y-2">
              {brief.tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3"
                >
                  <button
                    onClick={() => toggleTask(t.id)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/20 transition-all hover:border-primary hover:bg-primary/10 active:scale-90"
                    aria-label="Mark done"
                  >
                    <Check className="h-3.5 w-3.5 opacity-0" strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge tone={priorityTone(t.priority)} className="capitalize">
                        {t.priority}
                      </Badge>
                      {t.category && <span>{t.category}</span>}
                      {t.estimatedMinutes ? <span>· ~{t.estimatedMinutes} min</span> : null}
                      {t.dueAt && <span>· {relLabel(t.dueAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
              {brief.mode === "clear"
                ? "Nothing on your plate. A rare and beautiful thing."
                : "You're all caught up here."}
            </div>
          )}

          {brief.mode === "clear" && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/brain-dump"
                onClick={close}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary"
              >
                <Sparkles className="h-3.5 w-3.5" /> Brain dump what&apos;s on your mind
              </Link>
              <Link
                href="/goals"
                onClick={close}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary"
              >
                <Flame className="h-3.5 w-3.5" /> Check your goals
              </Link>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="pb-safe flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-7 py-4">
          <Link
            href={brief.cta.href}
            onClick={close}
            className="text-sm font-medium text-primary hover:underline"
          >
            {brief.cta.label} <ArrowRight className="inline h-3.5 w-3.5" />
          </Link>
          <Button onClick={close}>
            {brief.mode === "bedtime" ? "Good night" : "Start my day"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- logic --------------------------------- */

function priorityTone(p: string): "destructive" | "warning" | "primary" | "muted" {
  return p === "urgent" ? "destructive" : p === "high" ? "warning" : p === "low" ? "muted" : "primary";
}

function relLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000,
  );
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

function build(
  data: ReturnType<typeof useAppData>["data"],
  analytics: ReturnType<typeof useAppData>["analytics"],
): Brief {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const open = data.tasks.filter((t) => t.status === "todo");

  const overdue = open
    .filter((t) => t.dueAt && parseDate(t.dueAt) < startToday && !isStaleOverdue(t.dueAt, now))
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));

  const today = open
    .filter((t) => {
      const due = t.dueAt ? parseDate(t.dueAt) : null;
      const sched = t.scheduledAt ? new Date(t.scheduledAt) : null;
      return (
        (due && due >= startToday && due <= endToday) ||
        (sched && sched >= startToday && sched <= endToday)
      );
    })
    .sort((a, b) => rank(b) - rank(a));

  const upcoming = [
    ...open
      .filter((t) => t.dueAt && parseDate(t.dueAt) > endToday)
      .map((t) => t),
  ]
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 4);

  const done7 = analytics.completed7d;
  const streak = analytics.streakDays;

  // 1 — past bedtime
  if (isNight(data.profile.prefs.bedtime, now)) {
    const left = today.length + overdue.length;
    return {
      mode: "bedtime",
      icon: Moon,
      tone: "warning",
      title: `It's past your bedtime`,
      subtitle:
        left > 0
          ? `You aimed to be asleep by ${fmt12(data.profile.prefs.bedtime)}. ${left} thing${
              left === 1 ? "" : "s"
            } can wait until tomorrow.`
          : `You aimed to be asleep by ${fmt12(data.profile.prefs.bedtime)}. Everything's handled — rest up.`,
      tasks: [...overdue, ...today].slice(0, 3),
      extra: [
        { label: "done today", value: String(countDoneToday(data)) },
        { label: "wake-up", value: fmt12(data.profile.prefs.wakeTime) },
        { label: "streak", value: `${streak}d` },
      ],
      cta: { label: "Plan tomorrow", href: "/calendar" },
    };
  }

  // 2 — overdue
  if (overdue.length > 0) {
    return {
      mode: "overdue",
      icon: AlertTriangle,
      tone: "warning",
      title: `${overdue.length} task${overdue.length === 1 ? "" : "s"} slipped past`,
      subtitle: "Knock out the oldest one first, then move on.",
      tasks: overdue.slice(0, 5),
      cta: { label: "Open tasks", href: "/tasks" },
    };
  }

  // 3 — today
  if (today.length > 0) {
    const mins = today.reduce((n, t) => n + (t.estimatedMinutes ?? 30), 0);
    const nextEvent = data.events
      .filter((e) => new Date(e.startAt) > now && new Date(e.startAt) <= endToday)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    return {
      mode: "today",
      icon: ListChecks,
      tone: "primary",
      title: `${today.length} thing${today.length === 1 ? "" : "s"} on for today`,
      subtitle: nextEvent
        ? `Next up: ${nextEvent.title} at ${new Date(nextEvent.startAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}.`
        : "Here's the shortlist — everything else can wait.",
      tasks: today.slice(0, 5),
      extra: [
        { label: "est. work", value: mins >= 60 ? `${Math.round((mins / 60) * 10) / 10}h` : `${mins}m` },
        { label: "done this wk", value: String(done7) },
        { label: "streak", value: `${streak}d` },
      ],
      cta: { label: "See full day", href: "/dashboard" },
    };
  }

  // 4 — upcoming
  if (upcoming.length > 0) {
    return {
      mode: "upcoming",
      icon: CalendarClock,
      tone: "primary",
      title: "Nothing due today",
      subtitle: "But here's what's coming — a little now saves a scramble later.",
      tasks: upcoming,
      cta: { label: "Open calendar", href: "/calendar" },
    };
  }

  // 5 — clear
  return {
    mode: "clear",
    icon: Sun,
    tone: "primary",
    title: "You're clear",
    subtitle: "No deadlines, nothing overdue. Use the space, or get ahead.",
    tasks: [],
    extra: [
      { label: "done this wk", value: String(done7) },
      { label: "streak", value: `${streak}d` },
      { label: "active goals", value: String(analytics.activeGoals) },
    ],
    cta: { label: "Review goals", href: "/goals" },
  };
}

function rank(t: TaskDTO): number {
  const w = { urgent: 4, high: 3, medium: 2, low: 1 }[t.priority] ?? 2;
  return w + (t.dueAt && parseDate(t.dueAt) < new Date() ? 5 : 0);
}

function countDoneToday(data: ReturnType<typeof useAppData>["data"]): number {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  return data.tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= s).length;
}
