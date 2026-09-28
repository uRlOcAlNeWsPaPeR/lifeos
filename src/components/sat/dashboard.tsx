"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Flame, PauseCircle, Play, Timer, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress, Ring } from "@/components/ui/progress";
import { SingleChips } from "@/components/ui/choice-chips";
import { useSat } from "@/lib/sat/store";
import { useNow } from "@/lib/sat/hooks";
import { pickFromCatalog } from "@/lib/sat/qbank";
import {
  formatStudy, journeyPct, liveStreak, startTotal, studyTotals, todayStr, totalEstimate,
} from "@/lib/sat/engine";
import { EXAM_SPECS } from "@/lib/sat/constants";
import { isInPsatWindow, isOfficialSat } from "@/lib/sat/official-dates";
import { useOfficialDates } from "@/lib/sat/use-official-dates";
import { formatClock } from "@/lib/sat/exam";
import type { SatState, Section, TestKind } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { SatHeader } from "./common";
import { QuestionOfTheDay } from "./qotd";
import { SAT_ROUTES, useSatActions } from "./use-sat-actions";

/**
 * The SAT landing page. Deliberately short: one obvious thing to do now, your
 * test date, where your score sits, and today's question. Everything deeper —
 * strengths, badges, the exam library, settings — lives in its own tab, so a
 * student opening this for the first time isn't asked to read a whole console.
 */
export function SatDashboard() {
  const { s, version } = useSat();
  const { busy, startSet, resumeExam, resumeSet } = useSatActions();
  const p = s.profile!;

  const today = s.history[todayStr()] ?? { answered: 0, correct: 0 };
  const study = useMemo(() => studyTotals(s), [s, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const examLive = s.exam && s.exam.phase !== "done" ? s.exam : null;

  return (
    <>
      <SatHeader
        title={`Hey ${p.name}`}
        description="Practice a little every day. Start below — everything else is in the tabs above."
      />

      <div className="space-y-6">
        {/* Anything left mid-way is the real next action, so it comes first. */}
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

        <div className="grid gap-4 lg:grid-cols-3">
          <TodayCard
            s={s}
            done={today.answered}
            goal={p.dailyGoal}
            study={study}
            busy={busy === "mix"}
            onStart={() => startSet("mix", () => pickFromCatalog(s, { test: "sat", count: 10 }), "mixed")}
            className="lg:col-span-2"
          />
          <Countdown s={s} />
        </div>

        <ScoreCard s={s} />

        <QotdCard />
      </div>
    </>
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

/**
 * The one card a student needs on arrival: how far into today's goal they are,
 * the button that starts practicing, and the streak they're keeping alive.
 */
function TodayCard({
  s,
  done,
  goal,
  study,
  busy,
  onStart,
  className,
}: {
  s: SatState;
  done: number;
  goal: number;
  study: { today: number; month: number };
  busy: boolean;
  onStart: () => void;
  className?: string;
}) {
  const streak = liveStreak(s);
  const week = Array.from({ length: 7 }, (_, n) => {
    const d = todayStr(-(6 - n));
    return { d, done: (s.history[d]?.answered ?? 0) > 0, today: n === 6 };
  });

  return (
    <Card className={cn("flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6", className)}>
      <div className="relative shrink-0 self-center" role="img" aria-label={`${done} of ${goal} questions today`}>
        <Ring value={(done / Math.max(1, goal)) * 100} size={96} />
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{done}/{goal}</span>
          <span className="text-[10px] text-muted-foreground">today</span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {done >= goal ? "Today's goal is done." : done ? `${goal - done} more to hit today's goal.` : "Ready when you are."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          A quick mix of real College Board questions, picked for you.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={onStart} loading={busy}>
            <Zap className="h-4 w-4" />
            {done ? "Keep practicing" : "Start practicing"}
          </Button>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Flame className={cn("h-4 w-4", streak > 0 && "text-warning")} />
            {streak} day streak
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ol className="flex gap-1" aria-label="Last seven days">
            {week.map((d) => (
              <li
                key={d.d}
                title={d.d}
                className={cn(
                  "h-2 w-6 rounded-full",
                  d.done ? "bg-warning/70" : "bg-white/[0.08]",
                  d.today && "ring-1 ring-white/25",
                )}
              />
            ))}
          </ol>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            {formatStudy(study.today)} today · {formatStudy(study.month)} this month
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * Countdowns for the dates the student set in Settings — one card per test, so
 * someone sitting both the SAT and the PSAT sees both. Deliberately nothing
 * else: no generic "next SAT" unless they've chosen it.
 */
function Countdown({ s }: { s: SatState }) {
  const now = useNow();
  const { dates, live } = useOfficialDates();
  const p = s.profile!;
  const rows = (["sat", "psat"] as const)
    .map((k) => {
      const day = p.tests[k].testDate;
      return { k, day, d: day ? new Date(`${day}T08:00:00`) : null };
    })
    .filter((x): x is { k: TestKind; day: string; d: Date } => Boolean(x.d && x.d.getTime() > now))
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  if (!rows.length) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No test date set.{" "}
          <Link href={SAT_ROUTES.settings} className="text-primary hover:underline">
            Add your SAT or PSAT date
          </Link>{" "}
          for a countdown.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {rows.map(({ k, day, d }) => {
        const label = k === "sat" ? "SAT" : "PSAT/NMSQT";
        let sec = Math.max(0, Math.floor((d.getTime() - now) / 1000));
        const days = Math.floor(sec / 86400);
        sec %= 86400;
        const clock = `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
        // College Board can move a date after the student saved it.
        const stale = live && (k === "sat" ? !isOfficialSat(dates, day) : dates.psat.length > 0 && !isInPsatWindow(dates, day));
        return (
          <Card key={k} className="flex flex-col justify-center p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              {label}
            </p>
            <p className="mt-2 flex items-baseline gap-2" role="timer" aria-label={`${days} days until the ${label}`}>
              <span className="text-4xl font-semibold tabular-nums tracking-tight">{days}</span>
              <span className="text-sm text-muted-foreground">days away</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {clock} · {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            {stale && (
              <p className="mt-2 text-xs text-warning">
                College Board doesn&apos;t list this date right now.{" "}
                <Link href={SAT_ROUTES.settings} className="underline">
                  Check it
                </Link>
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * One score line rather than two full tracks: the test with a date on it leads,
 * the other is a footnote, and the full picture is a tap away in Progress.
 */
function ScoreCard({ s }: { s: SatState }) {
  const p = s.profile!;
  const lead: TestKind = p.tests.sat.testDate || !p.tests.psat.testDate ? "sat" : "psat";
  const other: TestKind = lead === "sat" ? "psat" : "sat";

  const now = totalEstimate(s, lead);
  const target = p.tests[lead].targetScore;
  const gap = target - now;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{EXAM_SPECS[lead].shortLabel} score estimate</p>
        <Link href={SAT_ROUTES.progress} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Full breakdown
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-primary">{now}</p>
        <p className="text-sm text-muted-foreground">
          from {startTotal(s, lead)} · target {target}
        </p>
      </div>

      <Progress value={journeyPct(s, lead)} className="mt-4" />
      <p className="mt-2.5 text-sm text-muted-foreground">
        {gap <= 0
          ? `You're at your ${EXAM_SPECS[lead].shortLabel} target. Keep it there.`
          : `${gap} points to go. Answering questions moves this.`}
        {" · "}
        {EXAM_SPECS[other].shortLabel} {totalEstimate(s, other)}
      </p>
    </Card>
  );
}

/** Today's question — one section at a time, so the page stays short. */
function QotdCard() {
  const [section, setSection] = useState<Section>("rw");
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">Question of the day</p>
        <SingleChips<Section>
          label="Question of the day section"
          value={section}
          onChange={setSection}
          options={[
            { value: "rw", label: "Reading & Writing" },
            { value: "math", label: "Math" },
          ]}
        />
      </div>
      <QuestionOfTheDay key={section} section={section} hideHeading />
    </Card>
  );
}

