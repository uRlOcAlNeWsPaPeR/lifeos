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
  Clock,
  Play,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStagePointer } from "@/hooks/use-stage-pointer";
import { getLastPage } from "@/lib/last-page";
import { normalize } from "@/lib/practice/answer";
import { shuffle } from "@/lib/practice/srs";
import { enterFocusFullscreen, exitFocusFullscreen } from "@/lib/study-lock";
import { useBrainGameLeaderboard } from "@/lib/brain-game-leaderboard";
import { TRIVIA_QUESTIONS, type TriviaQuestion } from "@/lib/trivia";
import { cn } from "@/lib/utils";

const CASUAL_LENGTH = 10;
// Nobody answers 60 trivia questions in 30 seconds — this is just enough
// runway that a very fast player never runs out mid-round.
const COMPETITIVE_LENGTH = 60;
const ROUND_SECONDS = 30;
const NUMBER_POOL = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "20", "50"];

const RANK_STYLE = [
  "bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-950",
  "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
  "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950",
];

type Mode = "casual" | "competitive";

interface RoundQuestion {
  q: TriviaQuestion;
  options: string[];
}

/** One multiple-choice question: the real answer plus 3 plausible wrong ones,
 *  drawn from a same-shaped pool so a number question never gets a country
 *  name as a choice. Boolean questions just get the two-way pair. */
function buildRound(pool: TriviaQuestion[], length: number): RoundQuestion[] {
  const others = (cat: TriviaQuestion["category"]) => pool.filter((p) => p.category === cat);
  const picked = shuffle(pool).slice(0, length);

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
 * sidebar. Casual is untimed, self-paced, just for fun. Competitive is a
 * 30-second fullscreen speed round — only correct answers count — and
 * finishing it (or beating your best) puts you on this week's leaderboard,
 * opt-in. Leaving fullscreen or switching tabs mid-round restarts it, a
 * light deterrent against looking answers up elsewhere.
 */
export function BrainGameView() {
  const router = useRouter();
  const stage = useStagePointer<HTMLDivElement>();
  const exitHref = useRef(getLastPage()).current;
  const lb = useBrainGameLeaderboard();

  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<Mode | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  // Competitive only: false = the "Ready?" gate before the clock starts.
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  // Set right before WE deliberately drop fullscreen (Exit, or finishing the
  // round normally) so the violation listener below doesn't mistake our own
  // exit for the student leaving.
  const intentionalRef = useRef(false);
  const submittedRef = useRef(false);

  const [round, setRound] = useState(0);
  const questions = useMemo(
    () => buildRound(TRIVIA_QUESTIONS, mode === "competitive" ? COMPETITIVE_LENGTH : CASUAL_LENGTH),
    [round, mode], // eslint-disable-line react-hooks/exhaustive-deps -- `round` forces a reshuffle
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

  // Competitive anti-cheat: armed for the whole competitive session (Ready
  // gate included) — never during mode-select, casual play, results, or
  // while the "you left" screen is already showing.
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

  // The 30-second clock — only ticks once the student has actually hit
  // "Start the clock" on the Ready screen.
  useEffect(() => {
    if (mode !== "competitive" || !started || done || interrupted) return;
    if (timeLeft <= 0) {
      finishRound();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, started, done, interrupted, timeLeft]);

  // Once finished, submit a competitive score for a student who's already
  // joined this week — silent, and only if it beats their existing best.
  useEffect(() => {
    if (mode === "competitive" && done && !submittedRef.current) {
      submittedRef.current = true;
      if (lb.own) void lb.submitScore(tally.right);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, done]);

  const rq = questions[index];

  function startCasual() {
    setMode("casual");
  }

  function startCompetitive() {
    intentionalRef.current = false;
    enterFocusFullscreen();
    setMode("competitive");
  }

  function beginClock() {
    submittedRef.current = false;
    setIndex(0);
    setChosen(null);
    setTally({ right: 0, wrong: 0 });
    setStreak(0);
    setBestStreak(0);
    setTimeLeft(ROUND_SECONDS);
    setDone(false);
    setInterrupted(false);
    intentionalRef.current = false;
    enterFocusFullscreen(); // defensive re-affirm — this click is a fresh user gesture
    setStarted(true);
  }

  function finishRound() {
    if (mode === "competitive") {
      intentionalRef.current = true;
      exitFocusFullscreen();
    }
    setDone(true);
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
    // Competitive is a speed round — auto-advance after a brief flash of the
    // reveal instead of waiting on a button click.
    if (mode === "competitive") {
      window.setTimeout(advance, 320);
    }
  }

  function advance() {
    setChosen(null);
    if (index + 1 >= questions.length) finishRound();
    else setIndex((i) => i + 1);
  }

  function playAgain() {
    setRound((r) => r + 1);
    if (mode === "competitive") {
      beginClock();
    } else {
      submittedRef.current = false;
      setIndex(0);
      setChosen(null);
      setTally({ right: 0, wrong: 0 });
      setStreak(0);
      setBestStreak(0);
      setDone(false);
      setInterrupted(false);
    }
  }

  function goExit() {
    intentionalRef.current = true;
    exitFocusFullscreen();
    router.push(exitHref);
  }

  if (booting) return <BootingScreen />;

  const showTimerChip = mode === "competitive" && started && !done && !interrupted;

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
            {showTimerChip && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums",
                  timeLeft <= 10
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-white/10 bg-white/[0.04] text-foreground",
                )}
              >
                <Clock className="h-3.5 w-3.5" /> {timeLeft}s
              </span>
            )}
            {streak >= 2 && !done && (
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

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center overflow-y-auto px-4 pb-10 scrollbar-thin">
        {!mode ? (
          <ModeSelect onCasual={startCasual} onCompetitive={startCompetitive} />
        ) : interrupted ? (
          <InterruptedScreen onRestart={beginClock} />
        ) : mode === "competitive" && !started ? (
          <ReadyScreen onStart={beginClock} />
        ) : done || !rq ? (
          mode === "competitive" ? (
            <CompetitiveResults
              score={tally.right}
              attempted={tally.right + tally.wrong}
              lb={lb}
              onPlayAgain={playAgain}
              onExit={goExit}
            />
          ) : (
            <ResultsScreen
              tally={tally}
              bestStreak={bestStreak}
              total={questions.length}
              onPlayAgain={playAgain}
              onExit={goExit}
            />
          )
        ) : (
          <>
            {mode === "casual" && (
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
            )}

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

            {/* Casual advances on a click; Competitive auto-advances (see choose()). */}
            {mode === "casual" && chosen && (
              <div className="mt-6 flex justify-end animate-slide-up">
                <Button onClick={advance}>
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
        Casual is just for fun. Competitive is a 30-second fullscreen speed round that puts your
        best score on this week's leaderboard.
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
            30 seconds, fullscreen. Leaving mid-round restarts it.
          </span>
        </button>
      </div>
    </div>
  );
}

function ReadyScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto max-w-md animate-fade-in text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg">
        <Clock className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">30 seconds. Go fast.</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Answer as many as you can before the clock runs out. Only correct answers count toward
        your score.
      </p>
      <Button className="mt-6" onClick={onStart}>
        <Play className="h-4 w-4" /> Start the clock
      </Button>
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

/** Results for a Competitive round: score, an opt-in leaderboard prompt (or
 *  silent score bump if already joined), and the live ranked board. */
function CompetitiveResults({
  score,
  attempted,
  lb,
  onPlayAgain,
  onExit,
}: {
  score: number;
  attempted: number;
  lb: ReturnType<typeof useBrainGameLeaderboard>;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [wantsJoinAnyway, setWantsJoinAnyway] = useState(false);

  const showPrompt = !lb.loading && !lb.own && (!lb.skipped || wantsJoinAnyway);
  const isNewBest = lb.own ? score > lb.own.points : false;
  const ownRank = lb.own ? lb.entries.findIndex((e) => e.uid === lb.own!.uid) : -1;

  async function confirmJoin() {
    if (!name.trim() || joining) return;
    setJoining(true);
    try {
      await lb.join(name, score);
      setWantsJoinAnyway(false);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="animate-fade-in text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-lg">
        <Trophy className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">
        {score} correct in 30 seconds
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {attempted} attempted
        {lb.own && !isNewBest && <> · your best this week is {lb.own.points}</>}
        {isNewBest && <span className="text-primary"> · new personal best!</span>}
      </p>

      {showPrompt && (
        <div className="mx-auto mt-5 max-w-xs animate-slide-up rounded-2xl border border-white/[0.09] bg-white/[0.03] p-5 text-center backdrop-blur-xl">
          <p className="text-sm font-medium">Add this score to the leaderboard?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a name and confirm — or skip and just watch.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && confirmJoin()}
            />
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void lb.skip();
                  setWantsJoinAnyway(false);
                }}
              >
                Skip
              </Button>
              <Button size="sm" onClick={confirmJoin} loading={joining} disabled={!name.trim()}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
      {!lb.loading && !lb.own && lb.skipped && !wantsJoinAnyway && (
        <p className="mt-3 text-xs text-muted-foreground">
          You skipped this week — just watching.{" "}
          <button
            onClick={() => setWantsJoinAnyway(true)}
            className="font-medium text-primary hover:underline"
          >
            Join anyway
          </button>
        </p>
      )}

      <div className="mx-auto mt-6 max-w-sm text-left">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          This week's leaderboard
        </p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
          {lb.loading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : lb.entries.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No one's joined this week yet — be the first.
            </p>
          ) : (
            lb.entries.slice(0, 10).map((e, i) => {
              const isOwn = lb.own?.uid === e.uid;
              return (
                <div
                  key={e.uid}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5",
                    isOwn ? "border-primary/40 bg-primary/[0.08]" : "border-white/[0.06] bg-white/[0.02]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      RANK_STYLE[i] ?? "border border-white/15 bg-white/[0.04] text-muted-foreground",
                    )}
                  >
                    {i === 0 ? <Crown className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {e.name}
                    {isOwn && <span className="ml-1 text-xs text-primary">(you)</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{e.points}</span>
                </div>
              );
            })
          )}
        </div>
        {lb.own && ownRank >= 10 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            You're #{ownRank + 1} — keep pushing to crack the top 10.
          </p>
        )}
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
