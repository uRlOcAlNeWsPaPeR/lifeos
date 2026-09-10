"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, SkipForward, Timer, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { binaryGrade, buildQueue, review, shuffle } from "@/lib/practice/srs";
import { checkAnswer } from "@/lib/practice/answer";
import { cn } from "@/lib/utils";
import type { CardDTO } from "@/lib/types";
import { GameShell, GameSummary, type GameProps } from "./game-shell";

const ROUND_MS = 60_000;
/** Seconds added for a correct answer — a good run buys its own extra time. */
const TIME_BONUS_MS = 2_500;
const BASE_POINTS = 10;
/** Combo stops multiplying here so one lucky streak can't dwarf a whole game. */
const MAX_MULTIPLIER = 5;

type Feedback =
  | { kind: "correct"; points: number }
  | { kind: "close"; answer: string }
  | { kind: "wrong"; answer: string }
  | null;

/**
 * Recall Rush — sixty seconds, type the answer, keep the combo alive.
 *
 * The other three modes test recognition; this one is free recall against a
 * clock, which is the hardest and stickiest way to practise. Answers are graded
 * leniently (see `checkAnswer`) so a typo never breaks a combo, and a near-miss
 * is shown rather than silently accepted.
 */
export function RecallRush({ cards, onFinish, onExit, best = 0 }: GameProps & { best?: number }) {
  const [round, setRound] = useState(0);
  const deck = useMemo(
    () => shuffle(buildQueue(cards, new Date())),
    [cards, round], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [updates, setUpdates] = useState<Record<string, CardDTO>>({});
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [endsAt, setEndsAt] = useState(() => Date.now() + ROUND_MS);
  const [remaining, setRemaining] = useState(ROUND_MS);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The deck cycles rather than running out — a 5-card deck still fills 60s.
  const card = deck.length ? deck[index % deck.length] : null;
  const multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / 3));

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      const left = endsAt - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setDone(true);
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(id);
  }, [done, endsAt]);

  // Keep focus on the input between cards so play never stalls.
  useEffect(() => {
    if (!done) inputRef.current?.focus();
  }, [index, done]);

  const finalCards = useMemo(() => cards.map((c) => updates[c.id] ?? c), [cards, updates]);

  function advance() {
    setTyped("");
    setIndex((i) => i + 1);
  }

  function submit() {
    if (!card || done) return;
    const answer = typed.trim();
    if (!answer) return;

    const verdict = checkAnswer(answer, card.back);
    const correct = verdict === "correct";

    setUpdates((u) => ({ ...u, [card.id]: review(u[card.id] ?? card, binaryGrade(correct)) }));

    if (correct) {
      const points = BASE_POINTS * multiplier;
      setScore((s) => s + points);
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((b) => Math.max(b, next));
        return next;
      });
      setTally((t) => ({ ...t, right: t.right + 1 }));
      setEndsAt((e) => e + TIME_BONUS_MS);
      setFeedback({ kind: "correct", points });
      advance();
      return;
    }

    // A near-miss keeps the combo but shows the real spelling, so the student
    // learns the exact wording without being punished for one letter.
    setTally((t) => ({ ...t, wrong: t.wrong + 1 }));
    if (verdict !== "close") setCombo(0);
    setFeedback({ kind: verdict, answer: card.back });
    advance();
  }

  function skip() {
    if (!card || done) return;
    setCombo(0);
    setFeedback({ kind: "wrong", answer: card.back });
    advance();
  }

  function finish(abandoned = false) {
    onFinish({ cards: finalCards, mode: "rush", ...tally, score, abandoned });
  }

  if (!deck.length) {
    return (
      <GameShell title="Recall Rush" onExit={() => finish(true)}>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Add a card to the deck to start a run.
        </p>
      </GameShell>
    );
  }

  if (done || !card) {
    const beaten = score > best;
    return (
      <GameShell title="Recall Rush" onExit={() => finish(true)}>
        <GameSummary
          title={beaten && best > 0 ? "New personal best" : "Time's up"}
          stats={[
            { label: "Score", value: String(score), tone: beaten ? "good" : "neutral" },
            { label: "Best combo", value: `${bestCombo}×` },
            { label: "Correct", value: `${tally.right}/${tally.right + tally.wrong}` },
          ]}
          onReplay={() => {
            setIndex(0); setTyped(""); setScore(0); setCombo(0); setBestCombo(0);
            setFeedback(null); setTally({ right: 0, wrong: 0 });
            setEndsAt(Date.now() + ROUND_MS); setRemaining(ROUND_MS);
            setDone(false); setRound((r) => r + 1);
          }}
          onDone={() => finish()}
        />
      </GameShell>
    );
  }

  const seconds = Math.ceil(remaining / 1000);
  const lowOnTime = seconds <= 10;

  return (
    <GameShell
      title="Recall Rush"
      subtitle="Type the answer — speed and streaks score"
      progress={remaining / ROUND_MS}
      onExit={() => finish(true)}
      right={
        <div className="flex items-center gap-3 text-sm tabular-nums">
          {combo >= 3 && (
            <span className="inline-flex animate-pop items-center gap-1 font-semibold text-warning">
              <Flame className="h-4 w-4" />
              {multiplier}×
            </span>
          )}
          <span className="font-semibold">{score}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              lowOnTime ? "animate-pulse font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            <Timer className="h-4 w-4" />
            {seconds}s
          </span>
        </div>
      }
    >
      <div className="mx-auto max-w-xl">
        {best > 0 && (
          <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" /> Best {best}
          </p>
        )}

        <div className="relative rounded-3xl border border-white/[0.09] bg-white/[0.02] p-8 text-center">
          {/* Floating score / correction, keyed so each answer re-triggers it. */}
          {feedback && (
            <span
              key={`${index}-${feedback.kind}`}
              className={cn(
                "pointer-events-none absolute inset-x-0 -top-2 animate-rise-out text-sm font-semibold",
                feedback.kind === "correct" && "text-success",
                feedback.kind === "close" && "text-warning",
                feedback.kind === "wrong" && "text-destructive",
              )}
            >
              {feedback.kind === "correct"
                ? `+${feedback.points}`
                : `${feedback.kind === "close" ? "Almost — " : ""}${feedback.answer}`}
            </span>
          )}

          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Term</span>
          <p key={`${card.id}-${index}`} className="mt-3 animate-pop text-balance text-2xl font-medium leading-snug">
            {card.front}
          </p>
          {card.hint && <p className="mt-3 text-sm text-muted-foreground">{card.hint}</p>}
        </div>

        <div className="mt-5 flex gap-2">
          <Input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
            }}
            placeholder="Type the answer…"
            className="h-12 flex-1 text-base"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Your answer"
          />
          <Button className="h-12" onClick={submit} disabled={!typed.trim()}>
            Enter
          </Button>
        </div>

        <div className="mt-3 flex justify-center">
          <button
            onClick={skip}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="h-3.5 w-3.5" /> Skip (breaks combo)
          </button>
        </div>
      </div>
    </GameShell>
  );
}
