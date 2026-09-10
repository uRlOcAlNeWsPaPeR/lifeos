"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Moon, Flame, ArrowRight } from "lucide-react";
import { useAppData } from "@/lib/store/app-data";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { LifeosCore, type CoreState } from "./lifeos-core";
import { NavDeck, NAV_ICONS, type NavItem } from "./nav-deck";
import { QuickAdd } from "./quick-add";
import { AiPriorityPanel } from "@/components/app/ai-priority-panel";
import { DeadlineList } from "@/components/app/deadline-list";
import { Progress } from "@/components/ui/progress";
import { goalProgress } from "@/lib/analytics-derive";
import { fmt12, hm } from "@/lib/scheduling/sleep";
import { greeting, parseDate } from "@/lib/format";
import type { Prefs } from "@/lib/firebase/schema";
import { cn } from "@/lib/utils";

const STATE_COPY: Record<CoreState, string> = {
  clear: "You're clear",
  steady: "On track",
  busy: "Busy day ahead",
  heavy: "Heavy load",
};

export function CommandCenter() {
  const { data, analytics } = useAppData();
  const stage = useStagePointer<HTMLDivElement>();
  // Ticks once a minute so time-of-day cues (the timeline "next", the after-hours
  // clock in the Core) stay current without a per-frame render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const prefs = data.profile.prefs;
  const firstName = data.profile.name.split(" ")[0] || "there";

  const model = useMemo(() => buildModel(data, analytics, now), [data, analytics, now]);

  const navItems: NavItem[] = [
    { href: "/tasks", label: "Tasks", icon: NAV_ICONS.tasks, sub: model.nav.tasks },
    { href: "/calendar", label: "Calendar", icon: NAV_ICONS.calendar, sub: model.nav.calendar },
    { href: "/brain-dump", label: "Brain Dump", icon: NAV_ICONS.brain, sub: "Clear your head" },
    { href: "/goals", label: "Goals", icon: NAV_ICONS.goals, sub: model.nav.goals },
    { href: "/school", label: "School", icon: NAV_ICONS.school, sub: model.nav.school },
    { href: "/analytics", label: "Analytics", icon: NAV_ICONS.analytics, sub: model.nav.analytics },
  ];

  return (
    <div ref={stage} className="relative">
      {/* cursor-follow lighting */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[1] opacity-70 motion-reduce:hidden"
        style={{
          background:
            "radial-gradient(650px circle at var(--mx,50%) var(--my,30%), hsl(var(--glow)/0.06), transparent 65%)",
        }}
      />

      {/* status strip */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {greeting(now)}, {firstName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              model.state === "clear" && "bg-primary",
              model.state === "steady" && "bg-primary",
              model.state === "busy" && "bg-[hsl(84_70%_55%)]",
              model.state === "heavy" && "bg-warning",
            )}
          />
          <span className="font-medium">{STATE_COPY[model.state]}</span>
          <span className="text-muted-foreground">· {model.radarTotal} on your radar</span>
        </div>
      </div>

      {/* main spatial grid */}
      <div className="grid gap-5 xl:grid-cols-12">
        {/* TODAY thread */}
        <section className="xl:col-span-4">
          <Panel title="Today" href="/calendar" hrefLabel="Calendar">
            <TodayThread model={model} prefs={prefs} now={now} />
          </Panel>
        </section>

        {/* CORE + FOCUS */}
        <section className="flex flex-col items-center gap-5 xl:col-span-4">
          <div className="relative w-full overflow-hidden rounded-3xl py-4">
            <LifeosCore
              state={model.state}
              label={model.core.label}
              value={model.core.value}
              className="w-full"
            />
          </div>
          <div className="w-full">
            <AiPriorityPanel />
          </div>
        </section>

        {/* RADAR */}
        <section className="xl:col-span-4">
          <Panel title="Radar" href="/tasks" hrefLabel="All tasks">
            <Radar model={model} />
          </Panel>
        </section>
      </div>

      {/* NAVIGATE */}
      <div className="mt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Navigate
        </p>
        <NavDeck items={navItems} />
      </div>

      <QuickAdd />
    </div>
  );
}

/* -------------------------------- panel -------------------------------- */

function Panel({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-surface h-full p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h2>
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          {hrefLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}

/* ----------------------------- today thread ----------------------------- */

function TodayThread({ model, prefs, now }: { model: Model; prefs: Prefs; now: Date }) {
  const moments = model.moments;
  const nextIdx = moments.findIndex((m) => m.at.getTime() > now.getTime() && m.stage !== "anchor");

  return (
    <ol className="relative space-y-4 pl-5">
      <span className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/50 via-white/10 to-primary/30" />
      {moments.length === 0 && (
        <li className="text-sm text-muted-foreground">
          Nothing on the calendar today. {model.core.label === "ON YOUR RADAR" ? "Your radar has the tasks that matter." : "Enjoy the open time."}
        </li>
      )}
      {moments.map((m, i) => {
        const past = m.at.getTime() < now.getTime() && m.stage !== "anchor";
        const isNext = i === nextIdx;
        const tag =
          m.stage === "anchor"
            ? m.title === "Bedtime"
              ? "Bedtime"
              : "Wind down"
            : past
              ? "Done"
              : isNext
                ? "Next"
                : i < nextIdx || nextIdx === -1
                  ? "Now"
                  : "Later";
        return (
          <li key={m.key} className={cn("relative", past && "opacity-45")}>
            <span
              className={cn(
                "absolute -left-[18px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                isNext
                  ? "bg-gradient-brand shadow-glow-sm"
                  : m.stage === "anchor"
                    ? "bg-primary/50"
                    : "bg-white/25",
              )}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.18em]",
                    isNext ? "text-primary" : "text-muted-foreground/70",
                  )}
                >
                  {tag}
                </p>
                <p className={cn("truncate text-sm", isNext ? "font-semibold" : "font-medium")}>
                  {m.title}
                </p>
                {m.meta && <p className="text-xs text-muted-foreground">{m.meta}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          </li>
        );
      })}
      <li className="relative pt-1 text-[11px] text-muted-foreground/70">
        <span className="absolute -left-[15px] top-2">
          <Moon className="h-3 w-3 text-primary/50" />
        </span>
        Target: ~{model.sleepHours}h sleep · up at {fmt12(prefs.wakeTime)}
      </li>
    </ol>
  );
}

/* -------------------------------- radar -------------------------------- */

function Radar({ model }: { model: Model }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-semibold tracking-tight">
          {model.radarTotal} {model.radarTotal === 1 ? "thing" : "things"} on your radar
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {model.radar.high > 0 && <span><b className="text-warning">{model.radar.high}</b> high priority</span>}
          {model.radar.dueToday > 0 && <span>· <b className="text-foreground">{model.radar.dueToday}</b> due today</span>}
          {model.radar.overdue > 0 && <span>· <b className="text-destructive">{model.radar.overdue}</b> overdue</span>}
          {model.radar.high + model.radar.dueToday + model.radar.overdue === 0 && (
            <span>Nothing urgent — nice.</span>
          )}
        </div>
      </div>

      {model.deadlines.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Coming up
          </p>
          <DeadlineList items={model.deadlines.slice(0, 4)} />
        </div>
      )}

      {model.goals.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Goals
            </p>
            <Link href="/goals" className="text-xs font-medium text-primary hover:underline">
              All
            </Link>
          </div>
          <div className="space-y-3">
            {model.goals.map((g) => (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{g.title}</span>
                  <span className="text-muted-foreground">{g.pct}%</span>
                </div>
                <Progress value={g.pct} tone={g.pct >= 100 ? "success" : "primary"} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Flame className="h-3.5 w-3.5 text-primary" />
          {model.streak}-day streak · {model.done7} done this week
        </span>
        <Link href="/analytics" className="font-medium text-primary hover:underline">
          Analytics <ArrowRight className="inline h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------- model -------------------------------- */

interface Moment {
  key: string;
  at: Date;
  title: string;
  meta?: string;
  stage: "event" | "task" | "due" | "anchor";
}
interface Model {
  state: CoreState;
  radarTotal: number;
  radar: { high: number; dueToday: number; overdue: number };
  core: { label: string; value: string };
  moments: Moment[];
  deadlines: {
    id: string;
    title: string;
    dueAt: string;
    kind: "task" | "assignment";
    color?: string | null;
    context?: string;
  }[];
  goals: { id: string; title: string; pct: number }[];
  streak: number;
  done7: number;
  sleepHours: number;
  nav: { tasks: string; calendar: string; goals: string; school: string; analytics: string };
}

function buildModel(
  data: ReturnType<typeof useAppData>["data"],
  analytics: ReturnType<typeof useAppData>["analytics"],
  now: Date,
): Model {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const prefs = data.profile.prefs;
  const open = data.tasks.filter((t) => t.status === "todo");

  const overdue = open.filter((t) => t.dueAt && parseDate(t.dueAt) < startToday);
  const dueToday = open.filter(
    (t) => t.dueAt && parseDate(t.dueAt) >= startToday && parseDate(t.dueAt) <= endToday,
  );
  const scheduledToday = open.filter(
    (t) => t.scheduledAt && new Date(t.scheduledAt) >= startToday && new Date(t.scheduledAt) <= endToday,
  );
  const highOpen = open.filter((t) => t.priority === "high" || t.priority === "urgent");

  const radarTotal = new Set([...overdue, ...dueToday, ...highOpen].map((t) => t.id)).size;
  const estToday =
    dueToday.reduce((n, t) => n + (t.estimatedMinutes ?? 30), 0) +
    scheduledToday.reduce((n, t) => n + (t.estimatedMinutes ?? 30), 0);

  // available tonight
  const bed = hm(prefs.bedtime);
  const cur = now.getHours() * 60 + now.getMinutes();
  const availTonight = Math.max(0, bed - Math.max(cur, hm(prefs.schoolEnd)));

  let score = dueToday.length + overdue.length * 2;
  if (estToday > availTonight && availTonight > 0) score += 2;
  const state: CoreState =
    score === 0 ? (radarTotal === 0 ? "clear" : "steady") : score <= 2 ? "steady" : score <= 5 ? "busy" : "heavy";

  // "past bedtime" runs from bedtime until 4:30am. For an after-midnight
  // bedtime (e.g. 00:30) only the small-hours window counts.
  const pastBedtime = bed >= 360 ? cur >= bed || cur < 270 : cur >= bed && cur < 270;

  // moments
  const moments: Moment[] = [];
  for (const e of data.events) {
    const s = new Date(e.startAt);
    if (s >= startToday && s <= endToday) {
      moments.push({
        key: `e-${e.id}`,
        at: s,
        title: e.title,
        meta: e.kind === "study_session" ? "Study session" : e.kind === "class" ? "Class" : undefined,
        stage: "event",
      });
    }
  }
  for (const t of scheduledToday) {
    moments.push({
      key: `s-${t.id}`,
      at: new Date(t.scheduledAt!),
      title: t.title,
      meta: t.estimatedMinutes ? `~${t.estimatedMinutes} min` : "Task",
      stage: "task",
    });
  }
  for (const t of dueToday) {
    if (scheduledToday.some((x) => x.id === t.id)) continue;
    const d = parseDate(t.dueAt!);
    moments.push({
      key: `d-${t.id}`,
      at: d.getHours() === 0 ? endToday : d,
      title: t.title,
      meta: "Due today",
      stage: "due",
    });
  }
  moments.sort((a, b) => a.at.getTime() - b.at.getTime());

  // anchors (setHours normalises minute values > 59 / < 0)
  const windDown = new Date(startToday);
  windDown.setHours(0, bed - prefs.windDownMinutes, 0, 0);
  const bedtime = new Date(startToday);
  bedtime.setHours(0, bed, 0, 0);
  moments.push(
    { key: "wind", at: windDown, title: "Wind down", stage: "anchor" },
    { key: "bed", at: bedtime, title: "Bedtime", stage: "anchor" },
  );

  // core value
  let core: Model["core"];
  if (pastBedtime) {
    // show the current hour, rolling over each hour (11 PM → 12 AM → 1 AM …)
    core = { label: "REST", value: fmt12(`${String(now.getHours()).padStart(2, "0")}:00`) };
  } else if (radarTotal > 0) {
    core = { label: "ON YOUR RADAR", value: String(radarTotal) };
  } else if (analytics.streakDays > 0) {
    core = { label: "DAY STREAK", value: `${analytics.streakDays}` };
  } else {
    core = { label: "ALL CLEAR", value: "✓" };
  }

  // deadlines (beyond today)
  const upTasks = open
    .filter((t) => t.dueAt && parseDate(t.dueAt) > endToday)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt!,
      kind: "task" as const,
      color: t.course?.color,
      context: t.course?.name ?? t.category ?? undefined,
    }));
  const upAssign = data.assignments
    .filter((a) => a.status !== "graded" && a.dueAt && parseDate(a.dueAt) >= startToday)
    .map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt!,
      kind: "assignment" as const,
      color: a.course?.color,
      context: a.course?.name ?? undefined,
    }));
  const deadlines = [...upTasks, ...upAssign]
    .sort((a, b) => +parseDate(a.dueAt) - +parseDate(b.dueAt))
    .slice(0, 8);

  const goals = data.goals
    .filter((g) => g.status === "active")
    .slice(0, 4)
    .map((g) => ({ id: g.id, title: g.title, pct: goalProgress(g) }));

  const sleepHours =
    Math.round((((hm(prefs.wakeTime) - hm(prefs.bedtime) + 1440) % 1440) / 60) * 10) / 10;

  const openAssign = data.assignments.filter((a) => a.status === "open").length;
  const eventsToday = moments.filter((m) => m.stage === "event").length;

  return {
    state,
    radarTotal,
    radar: { high: highOpen.length, dueToday: dueToday.length, overdue: overdue.length },
    core,
    moments,
    deadlines,
    goals,
    streak: analytics.streakDays,
    done7: analytics.completed7d,
    sleepHours,
    nav: {
      tasks: `${open.length} open${overdue.length ? ` · ${overdue.length} overdue` : ""}`,
      calendar: eventsToday ? `${eventsToday} today` : "Nothing today",
      goals: goals.length ? `${analytics.avgGoalProgress}% avg` : "Set a goal",
      school: openAssign ? `${openAssign} assignment${openAssign === 1 ? "" : "s"}` : "Courses & grades",
      analytics: `${analytics.completionRate}% completion`,
    },
  };
}
