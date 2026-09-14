"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Puzzle, ArrowLeft, Check, X, Flame, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { getLastPage } from "@/lib/last-page";
import { normalize } from "@/lib/practice/answer";
import { shuffle } from "@/lib/practice/srs";
import { TRIVIA_QUESTIONS, type TriviaQuestion } from "@/lib/trivia";
import { cn } from "@/lib/utils";

const ROUND_LENGTH = 10;
const NUMBER_POOL = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "20", "50"];

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
 * sidebar. A quick multiple-choice trivia round with no stakes, just fun.
 * "Exit" returns to wherever the student actually came from.
 */
export function BrainGameView() {
  const router = useRouter();
  const stage = useStagePointer<HTMLDivElement>();
  const exitHref = useRef(getLastPage()).current;

  const [booting, setBooting] = useState(true);
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

  const rq = questions[index];

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
    if (index + 1 >= questions.length) setDone(true);
    else setIndex(index + 1);
  }

  function playAgain() {
    setIndex(0);
    setChosen(null);
    setTally({ right: 0, wrong: 0 });
    setStreak(0);
    setBestStreak(0);
    setDone(false);
    setRound((r) => r + 1);
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
          onClick={() => router.push(exitHref)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-foreground/90 backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </button>
        <div className="flex items-center gap-2">
          {streak >= 2 && (
            <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning animate-pop">
              <Flame className="h-3.5 w-3.5" /> {streak} streak
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {tally.right} right · {tally.wrong} missed
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pb-10">
        {done || !rq ? (
          <ResultsScreen
            tally={tally}
            bestStreak={bestStreak}
            total={questions.length}
            onPlayAgain={playAgain}
            onExit={() => router.push(exitHref)}
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

function ResultsScreen({
  tally,
  bestStreak,
  total,
  onPlayAgain,
  onExit,
}: {
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
        {tally.right} of {total} correct
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
