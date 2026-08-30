"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut,
  Menu as MenuIcon,
  Flame,
  ArrowUpRight,
  Sparkles,
  Settings as SettingsIcon,
  CircleDot,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { AiPriorityPanel } from "@/components/app/ai-priority-panel";
import { DeadlineList } from "@/components/app/deadline-list";
import { useAuth } from "@/lib/firebase/auth-context";
import { useAppData } from "@/lib/store/app-data";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { LifeosCore, type CoreState } from "./lifeos-core";
import { NAV_ICONS } from "./nav-deck";
import { QuickAdd } from "./quick-add";
import { goalProgress } from "@/lib/analytics-derive";
import { greeting } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/tasks", label: "Tasks", icon: NAV_ICONS.tasks },
  { href: "/calendar", label: "Calendar", icon: NAV_ICONS.calendar },
  { href: "/brain-dump", label: "Brain Dump", icon: NAV_ICONS.brain },
  { href: "/goals", label: "Goals", icon: NAV_ICONS.goals },
  { href: "/school", label: "School", icon: NAV_ICONS.school },
  { href: "/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

type Phase = "home" | "boom" | "console" | "closing";

// detonation timeline (ms) — deliberately unhurried
const T = { charge: 220, burst: 720, shock: 820, shard: 880, flash: 680, reveal: 760 };
const TO_CONSOLE = 1650;
// reverse — collapse the console back into the Core
const TC = { implode: 380, flash: 560, reform: 780, reformDelay: 240, welcome: 760 };
const TO_HOME = 1180;

/**
 * The LifeOS Core. The dashboard opens on a calm welcome + a single glowing
 * sphere. Click it (or scroll / press Enter) and the Core detonates — a
 * shockwave, a burst of shards, a green flash — then clears into the working
 * console. Touch / reduced-motion get a quick cross-fade instead.
 */
export function CorePortal() {
  const { data, analytics } = useAppData();
  const stage = useStagePointer<HTMLDivElement>();
  const router = useRouter();
  const { logout } = useAuth();

  const [cinematic, setCinematic] = useState(false);
  const [phase, setPhase] = useState<Phase>("home");
  const phaseRef = useRef<Phase>("home");
  phaseRef.current = phase;
  const [menu, setMenu] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    // Cinematic on any real screen; touch is fine (tap the sphere). Only phones
    // and reduced-motion users get the plain scrolling fallback.
    const big = window.matchMedia("(min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setCinematic(big && !reduce);
  }, []);

  const firstName = data.profile.name.split(" ")[0] || "there";
  const m = useMemo(() => buildModel(data, analytics, now), [data, analytics, now]);

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const detonate = () => {
    if (phaseRef.current !== "home") return;
    setPhase("boom");
    window.setTimeout(() => setPhase("console"), reduced() ? 300 : TO_CONSOLE);
  };

  const exitToCore = () => {
    if (phaseRef.current !== "console") return;
    setPhase("closing");
    window.setTimeout(() => setPhase("home"), reduced() ? 260 : TO_HOME);
  };

  const returnCore = () => {
    setMenu(false);
    if (phaseRef.current === "console") exitToCore();
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ambientLine = useMemo(() => {
    const bits: string[] = [];
    if (m.dueToday) bits.push(`${m.dueToday} task${m.dueToday === 1 ? "" : "s"} today`);
    if (m.deadlineCount)
      bits.push(`${m.deadlineCount} upcoming deadline${m.deadlineCount === 1 ? "" : "s"}`);
    if (m.study) bits.push(`${m.study} study session${m.study === 1 ? "" : "s"}`);
    return bits.join("  ·  ") || "Nothing scheduled — a clear day.";
  }, [m]);

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  const onConsole = phase === "console" || phase === "closing";

  const topBar = (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-3 sm:px-8">
      <Link
        href="/"
        aria-label="LifeOS home"
        className="opacity-90 transition-opacity hover:opacity-100"
      >
        <Logo />
      </Link>
      {onConsole && (
        <div className="flex items-center gap-1.5">
          {cinematic && (
            <button
              onClick={exitToCore}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary"
            >
              <CircleDot className="h-4 w-4" />
              <span className="hidden sm:inline">Core</span>
            </button>
          )}
          <button
            onClick={() => setMenu(true)}
            aria-label="Menu"
            className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/[0.08]"
          >
            <MenuIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      )}
    </div>
  );

  const menuPopup = (
    <Modal open={menu} onClose={() => setMenu(false)} title="Go to">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={returnCore}
          className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:text-primary"
        >
          <Logo showText={false} />
          Core
        </button>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setMenu(false)}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:text-primary"
            >
              <Icon className="h-4 w-4 text-primary" />
              {s.label}
            </Link>
          );
        })}
      </div>
      <button
        onClick={doLogout}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </Modal>
  );

  const welcome = (
    <>
      <LiveClock name={firstName} />
      <p className="mx-auto mt-5 max-w-sm text-xs leading-relaxed text-muted-foreground/70">
        {ambientLine}
      </p>
    </>
  );

  /* ---------------- fallback: normal scrolling page ---------------- */
  if (!cinematic) {
    return (
      <>
        {topBar}
        <div ref={stage} className="relative min-h-screen px-4 pb-24 pt-16 sm:px-8">
          <div className="flex min-h-[70svh] flex-col items-center justify-center gap-9 py-10 text-center">
            {welcome}
            <button
              onClick={() => {
                setPhase("console");
                document.getElementById("console")?.scrollIntoView({ behavior: "smooth" });
              }}
              aria-label="Open the console"
              className="rounded-full transition-transform active:scale-95"
            >
              <LifeosCore variant="hero" state={m.state} />
            </button>
          </div>
          <div id="console" className="mx-auto mt-4 max-w-6xl">
            <Console model={m} constrained={false} />
          </div>
        </div>
        {onConsole && <QuickAdd />}
        {menuPopup}
      </>
    );
  }

  /* ---------------- cinematic ---------------- */
  return (
    <>
      {topBar}
      <div ref={stage} className="relative h-screen overflow-hidden">
        {/* cursor-follow ambient light — translated, not repainted */}
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

        {/* welcome */}
        {phase !== "console" && (
          <div
            aria-hidden={phase !== "home"}
            className="absolute inset-x-0 top-[13%] z-10 flex flex-col items-center px-6 text-center"
            style={{
              animation:
                phase === "boom"
                  ? `core-fade-out ${T.charge}ms ease forwards`
                  : phase === "closing"
                    ? `core-fade-in 420ms ease ${TC.welcome}ms both`
                    : undefined,
            }}
          >
            {welcome}
          </div>
        )}

        {/* the Core + detonation / reform */}
        {phase !== "console" && (
          <div className="absolute inset-0 grid place-items-center">
            {phase === "boom" && <BoomFx />}
            {phase === "closing" && <CloseFx />}
            <button
              onClick={detonate}
              disabled={phase !== "home"}
              aria-label="Enter LifeOS"
              className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              style={{
                transition: "transform 0.2s ease",
                animation:
                  phase === "boom"
                    ? `core-charge ${T.charge}ms ease-in forwards, core-burst ${T.burst}ms cubic-bezier(0.16,1,0.3,1) ${T.charge}ms forwards`
                    : phase === "closing"
                      ? `core-reform ${TC.reform}ms cubic-bezier(0.22,1,0.36,1) ${TC.reformDelay}ms both`
                      : undefined,
              }}
            >
              <span className="pointer-events-none block transition-transform duration-300 group-hover:scale-[1.04]">
                <LifeosCore variant="hero" state={m.state} />
              </span>
              {phase === "home" && (
                <span className="pointer-events-none absolute inset-x-0 -bottom-10 text-center text-[10px] uppercase tracking-[0.32em] text-muted-foreground/70 transition-opacity group-hover:text-primary">
                  Tap to enter
                </span>
              )}
            </button>
          </div>
        )}

        {/* the console */}
        {phase !== "home" && (
          <div
            className="absolute inset-0 z-20 flex flex-col px-4 pb-6 pt-[4.75rem] sm:px-8"
            style={{
              animation:
                phase === "boom"
                  ? `core-reveal ${T.reveal}ms cubic-bezier(0.22,1,0.36,1) ${TO_CONSOLE - T.reveal}ms both`
                  : phase === "closing"
                    ? `core-implode ${TC.implode}ms ease forwards`
                    : undefined,
            }}
          >
            <Console model={m} constrained />
          </div>
        )}
      </div>

      {onConsole && <QuickAdd />}
      {menuPopup}
    </>
  );
}

/* ------------------------------- boom fx ------------------------------- */

function BoomFx() {
  const shards = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const ang = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 220 + Math.random() * 340;
        return {
          dx: `${Math.round(Math.cos(ang) * dist)}px`,
          dy: `${Math.round(Math.sin(ang) * dist)}px`,
          size: 4 + Math.round(Math.random() * 8),
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {/* shockwaves */}
      <span
        className="absolute h-40 w-40 rounded-full"
        style={{
          border: "3px solid hsl(150 92% 68%)",
          animation: `core-shock ${T.shock}ms cubic-bezier(0.15,0.7,0.3,1) ${T.charge}ms forwards`,
        }}
      />
      <span
        className="absolute h-40 w-40 rounded-full"
        style={{
          border: "2px solid hsl(162 82% 60%)",
          animation: `core-shock ${T.shock + 90}ms cubic-bezier(0.15,0.7,0.3,1) ${T.charge + 120}ms forwards`,
        }}
      />
      {/* shards */}
      {shards.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: "hsl(150 88% 64%)",
            boxShadow: "0 0 8px 1px hsl(150 90% 60% / 0.7)",
            ["--dx" as string]: s.dx,
            ["--dy" as string]: s.dy,
            animation: `core-shard ${T.shard}ms cubic-bezier(0.2,0.6,0.25,1) ${T.charge}ms forwards`,
          }}
        />
      ))}
      {/* flash */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #ffffff, hsl(150 100% 68%) 26%, hsl(152 70% 44% / 0.4) 52%, transparent 74%)",
          animation: `core-flash ${T.flash}ms ease-out ${T.charge + 240}ms forwards`,
        }}
      />
    </div>
  );
}

/* ------------------------------- close fx ------------------------------- */

function CloseFx() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <span
        className="absolute h-40 w-40 rounded-full"
        style={{
          border: "2px solid hsl(152 80% 62%)",
          animation: `core-shock ${TC.reform}ms cubic-bezier(0.7,0,0.5,1) ${TC.reformDelay}ms reverse both`,
        }}
      />
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #ffffff, hsl(150 100% 70%) 22%, hsl(152 70% 44% / 0.35) 48%, transparent 72%)",
          animation: `core-flash ${TC.flash}ms ease-in-out ${TC.implode - 80}ms forwards`,
        }}
      />
    </div>
  );
}

/* -------------------------------- clock -------------------------------- */

function LiveClock({ name }: { name: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
        {greeting(now)}, {name}
      </p>
      <p className="mt-4 text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums sm:text-6xl">
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </p>
    </>
  );
}

/* -------------------------------- console -------------------------------- */

function Console({ model, constrained }: { model: Model; constrained: boolean }) {
  return (
    <div
      className={cn(
        "grid items-start gap-4 lg:grid-cols-3",
        constrained && "min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-1",
      )}
    >
      {/* TODAY */}
      <section className="card-surface flex flex-col p-4">
        <Header title="Today" href="/calendar" cta="Calendar" />
        {model.today.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing on the calendar today.</p>
        ) : (
          <ul className="mt-1 divide-y divide-white/[0.05]">
            {model.today.slice(0, 7).map((t) => (
              <li key={t.key} className="flex items-baseline gap-3 py-2">
                <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
        {model.today.length > 7 && (
          <Link href="/calendar" className="mt-2 text-xs font-medium text-primary hover:underline">
            +{model.today.length - 7} more
          </Link>
        )}
      </section>

      {/* FOCUS */}
      <section>
        <AiPriorityPanel />
      </section>

      {/* RADAR */}
      <section className="card-surface flex flex-col gap-4 p-4">
        <div>
          <p className="text-xl font-semibold tracking-tight">{model.radarTotal} on your radar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {model.high > 0 && (
              <>
                <b className="text-warning">{model.high}</b> high priority{" "}
              </>
            )}
            {model.dueToday > 0 && <>· {model.dueToday} due today </>}
            {model.overdue > 0 && (
              <>
                · <b className="text-destructive">{model.overdue}</b> overdue
              </>
            )}
            {model.high + model.dueToday + model.overdue === 0 && "Nothing urgent."}
          </p>
        </div>

        {model.deadlineItems.length > 0 && (
          <div>
            <Header title="Coming up" href="/calendar" cta="All" small />
            <DeadlineList items={model.deadlineItems.slice(0, 3)} />
          </div>
        )}

        {model.goals.length > 0 && (
          <div>
            <Header title="Goals" href="/goals" cta="All" small />
            <div className="space-y-2.5">
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

        <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" />
            {model.streak}-day streak · {model.done7} done
          </span>
          <Link href="/analytics" className="font-medium text-primary hover:underline">
            Analytics <ArrowUpRight className="inline h-3 w-3" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Header({
  title,
  href,
  cta,
  small,
}: {
  title: string;
  href: string;
  cta: string;
  small?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between", small ? "mb-1.5" : "mb-2")}>
      <h2
        className={cn(
          "font-semibold uppercase tracking-[0.18em] text-muted-foreground",
          small ? "text-[11px]" : "text-xs",
        )}
      >
        {title}
      </h2>
      <Link href={href} className="text-[11px] font-medium text-primary hover:underline">
        {cta}
      </Link>
    </div>
  );
}

/* -------------------------------- model -------------------------------- */

interface Model {
  state: CoreState;
  radarTotal: number;
  high: number;
  dueToday: number;
  overdue: number;
  deadlineCount: number;
  study: number;
  today: { key: string; at: Date; title: string }[];
  deadlineItems: {
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
}

function buildModel(
  data: ReturnType<typeof useAppData>["data"],
  analytics: ReturnType<typeof useAppData>["analytics"],
  now: Date,
): Model {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const open = data.tasks.filter((t) => t.status === "todo");

  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < start);
  const dueToday = open.filter(
    (t) => t.dueAt && new Date(t.dueAt) >= start && new Date(t.dueAt) <= end,
  );
  const scheduledToday = open.filter(
    (t) => t.scheduledAt && new Date(t.scheduledAt) >= start && new Date(t.scheduledAt) <= end,
  );
  const high = open.filter((t) => t.priority === "high" || t.priority === "urgent");
  const radarTotal = new Set([...overdue, ...dueToday, ...high].map((t) => t.id)).size;

  const eventsToday = data.events.filter((e) => {
    const s = new Date(e.startAt);
    return s >= start && s <= end;
  });
  const study = eventsToday.filter((e) => e.kind === "study_session").length;

  const today = [
    ...eventsToday.map((e) => ({ key: `e-${e.id}`, at: new Date(e.startAt), title: e.title })),
    ...scheduledToday.map((t) => ({
      key: `s-${t.id}`,
      at: new Date(t.scheduledAt!),
      title: t.title,
    })),
    ...dueToday
      .filter((t) => !scheduledToday.some((x) => x.id === t.id))
      .map((t) => {
        const d = new Date(t.dueAt!);
        return { key: `d-${t.id}`, at: d.getHours() === 0 ? end : d, title: `${t.title} — due` };
      }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const upTasks = open
    .filter((t) => t.dueAt && new Date(t.dueAt) > end)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt!,
      kind: "task" as const,
      color: t.course?.color,
      context: t.course?.name ?? t.category ?? undefined,
    }));
  const upAssign = data.assignments
    .filter((a) => a.status !== "graded" && a.dueAt && new Date(a.dueAt) >= start)
    .map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt!,
      kind: "assignment" as const,
      color: a.course?.color,
      context: a.course?.name ?? undefined,
    }));
  const deadlineItems = [...upTasks, ...upAssign].sort(
    (a, b) => +new Date(a.dueAt) - +new Date(b.dueAt),
  );

  const goals = data.goals
    .filter((g) => g.status === "active")
    .slice(0, 3)
    .map((g) => ({ id: g.id, title: g.title, pct: goalProgress(g) }));

  const score = dueToday.length + overdue.length * 2;
  const state: CoreState =
    score === 0
      ? radarTotal === 0
        ? "clear"
        : "steady"
      : score <= 2
        ? "steady"
        : score <= 5
          ? "busy"
          : "heavy";

  return {
    state,
    radarTotal,
    high: high.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    deadlineCount: deadlineItems.length,
    study,
    today,
    deadlineItems,
    goals,
    streak: analytics.streakDays,
    done7: analytics.completed7d,
  };
}
