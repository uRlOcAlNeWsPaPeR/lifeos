"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight, BookOpen, CalendarClock, ClipboardCheck, Flame, GraduationCap,
  Lock, PauseCircle, Play, Sigma, Timer, Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress, Ring } from "@/components/ui/progress";
import { SectionTitle } from "@/components/ui/misc";
import { useSat } from "@/lib/sat/store";
import { useNow } from "@/lib/sat/hooks";
import { pickFromCatalog } from "@/lib/sat/qbank";
import {
  formatStudy, journeyPct, liveStreak, startTotal, studyTotals, todayStr, totalEstimate,
} from "@/lib/sat/engine";
import { BADGES, EXAM_SPECS, SAT_DATES } from "@/lib/sat/constants";
import { formatClock } from "@/lib/sat/exam";
import type { SatState, TestKind } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { BadgeIcon, SatHeader, Stat } from "./common";
import { QuestionOfTheDay } from "./qotd";
import { SAT_ROUTES, useSatActions } from "./use-sat-actions";

export function SatDashboard() {
  const { s, version } = useSat();
  const { busy, startSet, startExam, resumeExam, resumeSet } = useSatActions();
  const p = s.profile!;

  const today = s.history[todayStr()] ?? { answered: 0, correct: 0 };
  const study = useMemo(() => studyTotals(s), [s, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const examLive = s.exam && s.exam.phase !== "done" ? s.exam : null;

  return (
    <>
      <SatHeader
        title="SAT Prep"
        description={`Hey ${p.name} — real College Board questions, adaptive practice exams and a score estimate that moves as you practice.`}
        action={
          <Button
            onClick={() => startSet("mix", () => pickFromCatalog(s, { test: "sat", count: 10 }), "mixed")}
            loading={busy === "mix"}
          >
            <Zap className="h-4 w-4" />
            Daily Mix
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Anything left mid-way comes first. */}
        {(examLive || s.pausedQuiz) && (
          <div className="grid gap-3 md:grid-cols-2">
            {examLive && (
              <ResumeCard
                title={`${EXAM_SPECS[examLive.kind].label} exam in progress`}
                detail={
                  examLive.phase === "break"
                    ? `On break — ${formatClock(examLive.breakLeft)} left, Math is next.`
                    : `Module ${examLive.cur + 1} of 4 · ${formatClock(examLive.modules[examLive.cur].timeLeft)} left`
                }
                onResume={resumeExam}
              />
            )}
            {s.pausedQuiz && (
              <ResumeCard
                title={s.pausedQuiz.name}
                detail={`${s.pausedQuiz.idx}/${s.pausedQuiz.qids.length} answered · paused practice set`}
                loading={busy === "resume"}
                onResume={resumeSet}
              />
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Countdown s={s} className="lg:col-span-2" />
          <TodayCard done={today.answered} goal={p.dailyGoal} study={study} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ScoreTrack s={s} kind="sat" />
          <ScoreTrack s={s} kind="psat" />
        </div>

        <section>
          <SectionTitle>Practice</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SectionLink s={s} section="rw" />
            <SectionLink s={s} section="math" />
            <Link href={SAT_ROUTES.exams} className="block">
              <Card interactive className="h-full p-5">
                <IconChip icon={ClipboardCheck} />
                <p className="mt-3 font-medium">Practice exam</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {examLive
                    ? `${EXAM_SPECS[examLive.kind].shortLabel} in progress — pick up where you stopped.`
                    : "Full-length adaptive SAT or PSAT with real timing."}
                </p>
              </Card>
            </Link>
            <Link href={SAT_ROUTES.guides} className="block">
              <Card interactive className="h-full p-5">
                <IconChip icon={BookOpen} />
                <p className="mt-3 font-medium">Study guides</p>
                <p className="mt-1 text-sm text-muted-foreground">Key formulas and grammar rules to remember.</p>
              </Card>
            </Link>
          </div>
        </section>

        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Adaptive digital SAT mock exam</p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Real multi-stage adaptation: score well in Module 1 to unlock the harder Module 2 and raise your score ceiling.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => (examLive ? resumeExam() : startExam("sat"))}
            loading={busy === "exam-sat-new"}
          >
            {examLive ? "Resume exam" : "Start adaptive mock"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>

        <StreakCard s={s} />

        <section>
          <SectionTitle>Question of the day</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-2">
            <QuestionOfTheDay section="rw" />
            <QuestionOfTheDay section="math" />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionTitle right={<span className="text-xs text-muted-foreground">{s.badges.length}/{BADGES.length}</span>}>
              Badges
            </SectionTitle>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BADGES.map((b) => {
                const got = s.badges.includes(b.id);
                return (
                  <li
                    key={b.id}
                    title={b.desc}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center",
                      got ? "border-primary/30 bg-primary/[0.06]" : "border-white/[0.06] opacity-50",
                    )}
                  >
                    {got ? <BadgeIcon id={b.id} className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-xs font-medium">{b.name}</span>
                    <span className="sr-only">{got ? "Earned" : "Locked"} — {b.desc}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function IconChip({ icon: Icon }: { icon: typeof Zap }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function ResumeCard({
  title,
  detail,
  onResume,
  loading,
}: {
  title: string;
  detail: string;
  onResume: () => void;
  loading?: boolean;
}) {
  return (
    <Card glow className="flex items-center gap-4 p-4">
      <PauseCircle className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button size="sm" onClick={onResume} loading={loading}>
        <Play className="h-3.5 w-3.5" />
        Resume
      </Button>
    </Card>
  );
}

/** Live countdown to the nearest set test date — or the next official SAT. */
function Countdown({ s, className }: { s: SatState; className?: string }) {
  const now = useNow();
  const p = s.profile!;
  const upcoming = (["sat", "psat"] as const)
    .map((k) => ({ k, d: p.tests[k].testDate ? new Date(`${p.tests[k].testDate}T08:00:00`) : null }))
    .filter((x): x is { k: TestKind; d: Date } => Boolean(x.d && x.d.getTime() > now))
    .sort((a, b) => a.d.getTime() - b.d.getTime())[0];

  let target: Date | null = upcoming?.d ?? null;
  let label = upcoming ? (upcoming.k === "sat" ? "SAT" : "PSAT/NMSQT") : "";
  if (!target) {
    const next = SAT_DATES.map((d) => new Date(`${d}T08:00:00`)).find((d) => d.getTime() > now);
    if (next) {
      target = next;
      label = "Next SAT";
    }
  }

  if (!target) {
    return (
      <Card className={cn("flex items-center gap-3 p-5", className)}>
        <CalendarClock className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No upcoming test date. <Link href={SAT_ROUTES.settings} className="text-primary hover:underline">Set one in SAT settings</Link>.
        </p>
      </Card>
    );
  }

  let sec = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const days = Math.floor(sec / 86400);
  sec %= 86400;
  const hours = Math.floor(sec / 3600);
  sec %= 3600;
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;

  return (
    <Card className={cn("p-5", className)}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarClock className="h-4 w-4 text-primary" />
        {label} · {target.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </p>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3" role="timer" aria-label={`${days} days until the ${label}`}>
        {[
          [days, "Days"],
          [hours, "Hours"],
          [mins, "Minutes"],
          [secs, "Seconds"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-3 text-center">
            <p className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{n}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TodayCard({ done, goal, study }: { done: number; goal: number; study: { today: number; month: number } }) {
  return (
    <Card className="flex items-center gap-5 p-5">
      <div className="relative shrink-0" role="img" aria-label={`${done} of ${goal} questions today`}>
        <Ring value={(done / Math.max(1, goal)) * 100} size={88} />
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{done}/{goal}</span>
          <span className="text-[10px] text-muted-foreground">today</span>
        </span>
      </div>
      <div className="grid flex-1 gap-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <Stat value={formatStudy(study.today)} label="Studied today" />
        </div>
        <Stat value={formatStudy(study.month)} label="This month" />
      </div>
    </Card>
  );
}

function ScoreTrack({ s, kind }: { s: SatState; kind: TestKind }) {
  const t = s.profile!.tests[kind];
  const label = kind === "sat" ? "SAT" : "PSAT/NMSQT";
  const start = startTotal(s, kind);
  const now = totalEstimate(s, kind);
  const target = t.targetScore;
  const gap = target - now;

  let when = `No ${kind === "sat" ? "SAT" : "PSAT"} date set`;
  if (t.testDate) {
    const test = new Date(`${t.testDate}T00:00:00`);
    const days = Math.ceil((test.getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000);
    when =
      days > 1
        ? `${days} days (${test.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
        : days === 1
          ? "Tomorrow"
          : days === 0
            ? "Today"
            : "Date passed — update in SAT settings";
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">
          <GraduationCap className="h-4 w-4 text-primary" />
          {label}
        </p>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat value={start} label="Start" />
        <Stat value={<span className="text-primary">{now}</span>} label="Estimated now" />
        <Stat value={target} label="Target" />
      </div>
      <Progress value={journeyPct(s, kind)} className="mt-4" />
      <p className="mt-2.5 text-xs text-muted-foreground">
        {gap <= 0 ? `Your ${label} estimate already meets your target.` : `${gap} points to go for ${label}.`}
      </p>
    </Card>
  );
}

function SectionLink({ s, section }: { s: SatState; section: "rw" | "math" }) {
  const st = s.sectionStats[section];
  const acc = st.att ? Math.round((st.corr / st.att) * 100) : 0;
  return (
    <Link href={`${SAT_ROUTES.practice}?section=${section}`} className="block">
      <Card interactive className="h-full p-5">
        <IconChip icon={section === "rw" ? BookOpen : Sigma} />
        <p className="mt-3 font-medium">{section === "rw" ? "Reading & Writing" : "Math"}</p>
        <Progress value={st.att ? acc : 0} className="mt-3 h-1.5" />
        <p className="mt-2 text-xs text-muted-foreground">
          {st.att ? `${acc}% correct · ${st.att} answered` : "Not started yet — tap to practice."}
        </p>
      </Card>
    </Link>
  );
}

function StreakCard({ s }: { s: SatState }) {
  const live = liveStreak(s);
  const doneToday = (s.history[todayStr()]?.answered ?? 0) > 0;
  const days = Array.from({ length: 7 }, (_, n) => {
    const i = 6 - n;
    const d = todayStr(-i);
    return {
      d,
      label: i === 0 ? "Today" : new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      count: s.history[d]?.answered ?? 0,
    };
  });

  return (
    <Card className="p-5">
      <SectionTitle>Streak</SectionTitle>
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="grid grid-cols-3 gap-6">
          <Stat value={<span className="flex items-center gap-1.5"><Flame className="h-5 w-5 text-warning" />{live}</span>} label="Day streak" />
          <Stat value={s.streak.best} label="Best ever" />
          <Stat value={s.counters.answered.toLocaleString()} label="Questions all-time" />
        </div>
        <ol className="grid grid-cols-7 gap-1.5" aria-label="Last seven days">
          {days.map((x) => (
            <li
              key={x.d}
              title={`${x.d}: ${x.count} questions`}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px]",
                x.count > 0 ? "border-warning/30 bg-warning/10 text-foreground" : "border-white/[0.06] text-muted-foreground",
              )}
            >
              <Flame className={cn("h-3.5 w-3.5", x.count > 0 ? "text-warning" : "opacity-30")} />
              {x.label}
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {doneToday
          ? "Streak safe — you practiced today."
          : live > 0
            ? "Practice today to keep your streak alive."
            : "Answer one question to light today's flame and start a streak."}
      </p>
    </Card>
  );
}
