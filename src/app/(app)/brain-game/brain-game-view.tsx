"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Puzzle,
  ArrowLeft,
  Check,
  X,
  Flame,
  RotateCcw,
  Trophy,
  Gamepad2,
  Maximize,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { getLastPage } from "@/lib/last-page";
import { normalize } from "@/lib/practice/answer";
import { shuffle } from "@/lib/practice/srs";
import { enterFocusFullscreen, exitFocusFullscreen } from "@/lib/study-lock";
import { TRIVIA_QUESTIONS, type TriviaQuestion } from "@/lib/trivia";
import { cn } from "@/lib/utils";

const ROUND_LENGTH = 10;
const NUMBER_POOL = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "20", "50"];

type Mode = "casual" | "competitive";

interface RoundQuestion {
  q: TriviaQuestion;
  options: string[];
}

/** One multiple-choice question: the real answer plus 3 plausible wrong ones,
 *  drawn from a same-shaped pool so a number question never gets a country
 *  name as a choice. Boolean questions just get the two-way pair. */
function buildRound(pool: TriviaQuestion[]): RoundQuestion[] {
  const others = (cat: TriviaQuestion["category"]) => pool.filter((p) => p.category === cat);
  const picked = shuffle(pool).slice(0, ROUND_LENGTH);

  return picked.map((q) => {
    if (q.category === "boolean") {
      const pair = /^(true|false)$/i.test(q.answer) ? ["True", "False"] : ["Yes", "No"];
      return { q, options: pair };
    }
    if (q.category === "number") {
      const rest = NUMBER_POOL.filter((n) => n !== q.answer);
      const distractors = shuffle(rest).slice(0, 3);
      return { q, options: shuffle([q.answer, ...distractors]) };
    }
    const taken = new Set([normalize(q.answer)]);
    const distractors: string[] = [];
    for (const other of shuffle(others("other"))) {
      if (distractors.length >= 3) break;
      if (other.id === q.id) continue;
      const key = normalize(other.answer);
      if (!key || taken.has(key)) continue;
      taken.add(key);
      distractors.push(other.answer);
    }
    return { q, options: shuffle([q.answer, ...distractors]) };
  });
}

/**
 * The Brain Game — a full-bleed screen like the Assistant, reached from the
 * sidebar. Casual is just for fun; Competitive locks the screen fullscreen
 * and restarts the round the moment the student leaves it (Esc, alt-tab, a
 * new tab to look something up) — a light anti-cheat measure, not a hard
 * guarantee. "Exit" returns to wherever the student actually came from.
 */
export function BrainGameView() {
  const router = useRouter();
  const stage = useStagePointer<HTMLDivElement>();
  const exitHref = useRef(getLastPage()).current;

  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<Mode | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  // Set right before WE deliberately drop fullscreen (Exit, or finishing the
  // round normally) so the violation listener below doesn't mistake our own
  // exit for the student leaving.
  const intentionalRef = useRef(false);

  const [round, setRound] = useState(0);
  const questions = useMemo(
    () => buildRound(TRIVIA_QUESTIONS),
    [round], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 650);
    return () => clearTimeout(t);
  }, []);

  // Competitive anti-cheat: only armed during an actual in-progress
  // competitive round (never during mode-select, casual play, results, or
  // while the "you left" screen is already showing).
  useEffect(() => {
    if (mode !== "competitive" || done || interrupted) return;
    const violate = () => {
      if (intentionalRef.current) return;
      setInterrupted(true);
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) violate();
    };
    const onVisibility = () => {
      if (document.hidden) violate();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode, done, interrupted]);

  const rq = questions[index];

  function startCasual() {
    setMode("casual");
  }

  function startCompetitive() {
    intentionalRef.current = false;
    enterFocusFullscreen();
    setMode("competitive");
  }

  function choose(option: string) {
    if (chosen || !rq) return;
    setChosen(option);
    const correct = option === rq.q.answer;
    setTally((t) => (correct ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
    setStreak((s) => {
      const next = correct ? s + 1 : 0;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });
  }

  function next() {
    setChosen(null);
    if (index + 1 >= questions.length) {
      if (mode === "competitive") {
        intentionalRef.current = true;
        exitFocusFullscreen();
      }
      setDone(true);
    } else {
      setIndex(index + 1);
    }
  }

  function playAgain() {
    setIndex(0);
    setChosen(null);
    setTally({ right: 0, wrong: 0 });
    setStreak(0);
    setBestStreak(0);
    setDone(false);
    setInterrupted(false);
    setRound((r) => r + 1);
    if (mode === "competitive") {
      intentionalRef.current = false;
      enterFocusFullscreen();
    }
  }

  function goExit() {
    intentionalRef.current = true;
    exitFocusFullscreen();
    router.push(exitHref);
  }

  if (booting) return <BootingScreen />;

  return (
    <div ref={stage} className="relative flex h-[100svh] flex-col overflow-hidden bg-background">
      {/* cursor-follow ambient light — same treatment as the Core / Assistant */}
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

      {/* top bar */}
      <div className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
        <button
          onClick={goExit}
          className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-foreground/90 backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </button>
        {mode && (
          <div className="flex items-center gap-2">
            {mode === "competitive" && (
              <span className="flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive">
                <Maximize className="h-3.5 w-3.5" /> Competitive
              </span>
            )}
            {streak >= 2 && (
              <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning animate-pop">
                <Flame className="h-3.5 w-3.5" /> {streak} streak
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {tally.right} right · {tally.wrong} missed
            </span>
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pb-10">
        {!mode ? (
          <ModeSelect onCasual={startCasual} onCompetitive={startCompetitive} />
        ) : interrupted ? (
          <InterruptedScreen onRestart={playAgain} />
        ) : done || !rq ? (
          <ResultsScreen
            mode={mode}
            tally={tally}
            bestStreak={bestStreak}
            total={questions.length}
            onPlayAgain={playAgain}
            onExit={goExit}
          />
        ) : (
          <>
            <div className="mb-6">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-brand transition-all duration-500"
                  style={{ width: `${(index / questions.length) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Question {index + 1} of {questions.length}
              </p>
            </div>

            <div className="rounded-3xl border border-white/[0.09] bg-white/[0.03] p-7 text-center backdrop-blur-xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-sm">
                <Puzzle className="h-4 w-4" />
              </span>
              <p key={rq.q.id} className="mt-4 animate-pop text-balance text-xl font-medium leading-snug">
                {rq.q.question}
              </p>
            </div>

            <div className="mt-5 space-y-2.5">
              {rq.options.map((option) => {
                const isAnswer = option === rq.q.answer;
                const isChosen = option === chosen;
                const revealed = chosen !== null;
                return (
                  <button
                    key={option}
                    onClick={() => choose(option)}
                    disabled={revealed}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition-all",
                      !revealed &&
                        "border-white/[0.09] bg-white/[0.03] backdrop-blur-xl hover:-translate-y-[1px] hover:border-primary/40",
                      revealed && isAnswer && "border-success/50 bg-success/10",
                      revealed &&
                        isChosen &&
                        !isAnswer &&
                        "animate-shake border-destructive/50 bg-destructive/10",
                      revealed && !isAnswer && !isChosen && "border-white/[0.06] opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                        revealed && isAnswer && "border-success bg-success text-white",
                        revealed && isChosen && !isAnswer && "border-destructive bg-destructive text-white",
                        (!revealed || (!isAnswer && !isChosen)) && "border-white/20",
                      )}
                    >
                      {revealed && isAnswer && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      {revealed && isChosen && !isAnswer && <X className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="flex-1">{option}</span>
                  </button>
                );
              })}
            </div>

            {chosen && (
              <div className="mt-6 flex justify-end animate-slide-up">
                <Button onClick={next}>
                  {index + 1 >= questions.length ? "See results" : "Next question"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ModeSelect({
  onCasual,
  onCompetitive,
}: {
  onCasual: () => void;
  onCompetitive: () => void;
}) {
  return (
    <div className="animate-fade-in text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg">
        <Puzzle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Pick your mode</h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Casual is just for fun. Competitive goes fullscreen — leave it and the round restarts,
        so it stays fair.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <button
          onClick={onCasual}
          className="flex flex-col items-center gap-2 rounded-3xl border border-white/[0.09] bg-white/[0.03] p-6 text-center backdrop-blur-xl transition-all hover:-translate-y-[1px] hover:border-primary/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="font-medium">Casual</span>
          <span className="text-xs text-muted-foreground">
            Play at your own pace — leave and come back anytime.
          </span>
        </button>

        <button
          onClick={onCompetitive}
          className="flex flex-col items-center gap-2 rounded-3xl border border-white/[0.09] bg-white/[0.03] p-6 text-center backdrop-blur-xl transition-all hover:-translate-y-[1px] hover:border-destructive/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
            <Trophy className="h-5 w-5" />
          </span>
          <span className="font-medium">Competitive</span>
          <span className="text-xs text-muted-foreground">
            Fullscreen lock. Leaving mid-round restarts it from question 1.
          </span>
        </button>
      </div>
    </div>
  );
}

function InterruptedScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="mx-auto max-w-md animate-fade-in text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Round restarted</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        You left fullscreen or switched away — to keep Competitive fair, the round starts over
        from question 1.
      </p>
      <Button className="mt-6" onClick={onRestart}>
        <Maximize className="h-4 w-4" /> Back to fullscreen &amp; restart
      </Button>
    </div>
  );
}

function ResultsScreen({
  mode,
  tally,
  bestStreak,
  total,
  onPlayAgain,
  onExit,
}: {
  mode: Mode;
  tally: { right: number; wrong: number };
  bestStreak: number;
  total: number;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const pct = total ? Math.round((tally.right / total) * 100) : 0;
  const headline = pct >= 80 ? "Nicely played" : pct >= 50 ? "Good round" : "Nice try";

  return (
    <div className="animate-fade-in text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg">
        <Trophy className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">{headline}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {tally.right} of {total} correct · {mode === "competitive" ? "Competitive" : "Casual"}{" "}
        round
      </p>

      <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-lg font-semibold">{pct}%</p>
          <p className="text-[11px] text-muted-foreground">score</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-lg font-semibold text-success">{tally.right}</p>
          <p className="text-[11px] text-muted-foreground">correct</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="flex items-center justify-center gap-1 text-lg font-semibold text-warning">
            <Flame className="h-4 w-4" /> {bestStreak}
          </p>
          <p className="text-[11px] text-muted-foreground">best streak</p>
        </div>
      </div>

      <div className="mt-7 flex justify-center gap-2.5">
        <Button variant="outline" onClick={onExit}>
          Exit
        </Button>
        <Button onClick={onPlayAgain}>
          <RotateCcw className="h-4 w-4" /> Play again
        </Button>
      </div>
    </div>
  );
}

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
          <Puzzle className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-5 animate-fade-in text-sm text-muted-foreground">Shuffling questions…</p>
    </div>
  );
}
