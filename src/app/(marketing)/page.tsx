"use client";

import Link from "next/link";
import {
  Sparkles,
  GraduationCap,
  Target,
  CalendarDays,
  BarChart3,
  Brain,
  ArrowRight,
  ListChecks,
  ChevronDown,
  Moon,
  Percent,
  Gamepad2,
  NotebookPen,
  PenLine,
  ClipboardCheck,
  RotateCcw,
  Layers,
  CalendarClock,
  Flame,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CursorGlow } from "@/components/marketing/cinematic/cursor-glow";
import { DeskScene, BookshelfScene, WritingScene } from "@/components/marketing/cinematic/scenes";
import { Reveal, RevealWords, Parallax } from "@/components/marketing/cinematic/scroll-fx";

export default function LandingPage() {
  return (
    <>
      <CursorGlow />

      {/* ─────────────────────────── HERO ─────────────────────────── */}
      <section className="relative flex h-[100svh] flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <DeskScene />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/30 to-background" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal delay={0.1} y={16} blur={false}>
            <Badge tone="primary" className="mx-auto mb-8">
              <Sparkles className="h-3 w-3" /> AI-powered planning for students
            </Badge>
          </Reveal>
          <h1 className="text-[13vw] font-semibold leading-[0.95] tracking-[-0.03em] sm:text-7xl md:text-[5.5rem]">
            <Reveal delay={0.2}>
              <span className="block text-foreground">Your entire student life.</span>
            </Reveal>
            <Reveal delay={0.42}>
              <span className="block text-gradient">Organized.</span>
            </Reveal>
          </h1>
          <Reveal delay={0.7} y={14} blur={false}>
            <p className="mx-auto mt-7 max-w-xl text-base text-muted-foreground sm:text-lg">
              Assignments, deadlines, goals and study time — one calm system that plans your week
              and knows when to stop.
            </p>
          </Reveal>
          <Reveal delay={0.85} y={14} blur={false}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup">
                <Button size="lg" className="group w-full sm:w-auto">
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <a href="#story">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  See How It Works
                </Button>
              </a>
            </div>
          </Reveal>
        </div>

        <a
          href="#story"
          aria-label="Scroll"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground/60 transition-colors hover:text-primary"
        >
          <ChevronDown className="h-6 w-6 animate-bounce [animation-duration:2.5s]" />
        </a>
      </section>

      {/* ───────────────────── ACT I — one place ───────────────────── */}
      <section id="story" className="relative flex min-h-[100svh] items-center overflow-hidden py-24">
        <Parallax speed={0.18} className="pointer-events-none absolute -right-[8%] top-1/2 h-[80vh] w-[80vh] -translate-y-1/2 opacity-90">
          <BookshelfScene />
        </Parallax>
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <div className="max-w-xl">
            <Reveal blur={false}>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">The idea</p>
            </Reveal>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              <RevealWords text="Every class, every deadline, every plan — on one shelf." />
            </h2>
            <Reveal delay={0.15}>
              <p className="mt-6 text-lg text-muted-foreground">
                No more five apps and a paper planner. LifeOS holds your whole academic life so you
                open one thing in the morning and know exactly where you stand.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─────────────────── ACT II — sleep-aware ─────────────────── */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <Reveal blur={false}>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">
                What makes it different
              </p>
            </Reveal>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              <RevealWords text="It plans around your sleep." />
            </h2>
            <Reveal delay={0.15}>
              <p className="mt-6 text-lg text-muted-foreground">
                Tell LifeOS your bedtime once. It fits work into your real free time and warns you
                before a task spills past midnight — then offers to move it, split it, or let you
                push through anyway. It suggests. You decide.
              </p>
            </Reveal>
            <Reveal delay={0.28}>
              <div className="mt-8 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm">
                <Moon className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">11:00 PM</span> — Desired bedtime.
                  Nothing scheduled past it unless you say so.
                </span>
              </div>
            </Reveal>
          </div>
          <Parallax speed={0.12} className="mx-auto w-full max-w-lg">
            <div className="card-surface ai-glow overflow-hidden p-3">
              <WritingScene />
            </div>
          </Parallax>
        </div>
      </section>

      {/* ─────────────────────── FEATURES ─────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything a student juggles, in one calm place
            </h2>
          </div>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(
            [
              { icon: Sparkles, title: "AI-powered planning", body: "Every morning LifeOS reviews your deadlines, schedule and goals and picks the three things to focus on — with the reasoning behind each." },
              { icon: Brain, title: "Brain Dump", body: "Type everything on your mind. LifeOS turns the mess into structured tasks you review one at a time before anything saves." },
              { icon: Moon, title: "Sleep-aware scheduling", body: "Set your bedtime once. LifeOS won't push normal work past it — and always lets you override." },
              { icon: GraduationCap, title: "Canvas sync", body: "Connect Canvas and your courses, assignments, due dates and grades come in on their own — no retyping." },
              { icon: Percent, title: "Grades & GPA", body: "Every class's current grade, weighted and unweighted GPA on your school's scale, and calculators for what you need on the final." },
              { icon: Gamepad2, title: "Study tools", body: "Paste a vocab list or your notes and practice with flashcards, matching, quizzes and Recall Rush." },
              { icon: Target, title: "Goals", body: "“Get an A in Physics.” “Practice guitar 4× a week.” Track milestones and the tasks that move them." },
              { icon: CalendarDays, title: "One calendar", body: "Tasks, deadlines, classes and study sessions on one view. A change anywhere updates everywhere." },
              { icon: NotebookPen, title: "SAT Prep", body: "Real College Board questions, full adaptive practice exams and a score estimate, built right in." },
            ] as const
          ).map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <div className="card-surface card-hover h-full p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 font-medium">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─────────────────────── SAT PREP ─────────────────────── */}
      <section id="sat" className="relative overflow-hidden py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <Reveal blur={false}>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">SAT Prep, built in</p>
            </Reveal>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              <RevealWords text="Study for the SAT where you already plan." />
            </h2>
            <Reveal delay={0.15}>
              <p className="mt-6 text-lg text-muted-foreground">
                Real questions from the College Board question bank, a plan paced to your test date,
                and a score estimate that moves as you practice. No separate app, no extra login.
              </p>
            </Reveal>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { icon: PenLine, title: "Targeted practice", body: "Pick a section, skill or difficulty." },
                  { icon: ClipboardCheck, title: "Full practice exams", body: "Adaptive, timed, module by module." },
                  { icon: RotateCcw, title: "Review mistakes", body: "Every miss comes back until you get it." },
                  { icon: Layers, title: "Flashcards & guides", body: "Vocab, roots, formulas and grammar rules." },
                  { icon: CalendarClock, title: "Test-day countdown", body: "SAT and PSAT dates, straight from College Board." },
                  { icon: Flame, title: "Daily goal & streak", body: "A little every day adds up." },
                ] as const
              ).map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={0.1 + (i % 2) * 0.06}>
                  <div className="flex h-full items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="block text-xs text-muted-foreground">{body}</span>
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* A still of the SAT overview — illustrative numbers, not a real student's. */}
          <Parallax speed={0.12} className="mx-auto w-full max-w-md">
            <Reveal delay={0.2}>
              <div className="card-surface ai-glow space-y-4 p-6" aria-hidden="true">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Estimated score</span>
                  <Badge tone="primary">
                    <TrendingUp className="h-3 w-3" /> +60 this month
                  </Badge>
                </div>
                <p className="text-5xl font-semibold tracking-tight">
                  1340<span className="ml-2 text-base font-normal text-muted-foreground">/ 1600</span>
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Reading & Writing", score: 680, pct: 85 },
                    { label: "Math", score: 660, pct: 82 },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{s.label}</span>
                        <span className="tabular-nums text-foreground">{s.score}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <span>
                      <span className="font-medium">38 days</span>
                      <span className="block text-xs text-muted-foreground">to test day</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-primary" />
                    <span>
                      <span className="font-medium">12-day streak</span>
                      <span className="block text-xs text-muted-foreground">10 / 10 today</span>
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </Parallax>
        </div>
      </section>

      {/* ─────────────────────── HOW IT WORKS ─────────────────────── */}
      <section id="how" className="border-y border-white/[0.06] bg-white/[0.015] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                From chaos to a plan in three steps
              </h2>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {(
              [
                { icon: ListChecks, n: "1", title: "Tell LifeOS about your world", body: "Quick setup captures your classes, sleep schedule, goals and what you want help with." },
                { icon: Brain, n: "2", title: "Brain dump the rest", body: "Everything you're carrying around becomes structured tasks you approve, one at a time." },
                { icon: Sparkles, n: "3", title: "Open it every morning", body: "Today's tasks, upcoming deadlines and your AI priority list. That's the whole ritual." },
              ] as const
            ).map(({ icon: Icon, n, title, body }, i) => (
              <Reveal key={n} delay={i * 0.1}>
                <div className="card-surface h-full p-6">
                  <div className="relative inline-flex">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white shadow-glow-sm ring-2 ring-background">
                      {n}
                    </span>
                  </div>
                  <p className="mt-4 font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── FINAL CTA ─────────────────────── */}
      <section className="relative flex min-h-[80svh] items-center overflow-hidden">
        <Parallax speed={0.3} className="pointer-events-none absolute inset-0 opacity-60">
          <DeskScene />
        </Parallax>
        <div className="absolute inset-0 bg-background/75" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              Your student life, <span className="text-gradient">finally in one system.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12} blur={false}>
            <p className="mx-auto mt-5 max-w-lg text-muted-foreground">
              Set it up in three minutes. Open it every morning.
            </p>
          </Reveal>
          <Reveal delay={0.22} blur={false}>
            <Link href="/signup" className="mt-8 inline-block">
              <Button size="lg">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
