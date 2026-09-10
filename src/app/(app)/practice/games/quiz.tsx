"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { binaryGrade, buildQueue, review, shuffle } from "@/lib/practice/srs";
import { normalize } from "@/lib/practice/answer";
import { cn } from "@/lib/utils";
import type { CardDTO } from "@/lib/types";
import { GameShell, GameSummary, type GameProps } from "./game-shell";

const SESSION_LIMIT = 15;
const CHOICES = 4;

interface Question {
  card: CardDTO;
  options: string[];
  answer: string;
}

/**
 * Build one multiple-choice question: the card's own back, plus wrong answers
 * borrowed from other cards in the deck.
 *
 * Distractors are filtered so none of them mean the same thing as the real
 * answer — otherwise a deck with "mitochondria" and "the mitochondria" can
 * present two correct options and mark the student wrong for picking one.
 */
function buildQuestion(card: CardDTO, deck: CardDTO[]): Question {
  const answer = card.back;
  const taken = new Set([normalize(answer)]);
  const distractors: string[] = [];

  for (const other of shuffle(deck)) {
    if (distractors.length >= CHOICES - 1) break;
    if (other.id === card.id) continue;
    const key = normalize(other.back);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    distractors.push(other.back);
  }

  return { card, answer, options: shuffle([answer, ...distractors]) };
}

/**
 * Multiple choice over the deck. Recognition is easier than recall, so this is
 * the mode to start a new deck with — it graduates cards to the point where
 * Rush and Flashcards stop being demoralising.
 */
export function Quiz({ cards, onFinish, onExit }: GameProps) {
  const [round, setRound] = useState(0);
  const questions = useMemo(
    () => buildQueue(cards, new Date(), SESSION_LIMIT).map((c) => buildQuestion(c, cards)),
    [cards, round], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Record<string, CardDTO>>({});
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [done, setDone] = useState(false);

  const q = questions[index];
  const finalCards = useMemo(() => cards.map((c) => updates[c.id] ?? c), [cards, updates]);

  function choose(option: string) {
    if (chosen || !q) return;
    setChosen(option);
    const correct = option === q.answer;
    setTally((t) => (correct ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
    setUpdates((u) => ({ ...u, [q.card.id]: review(u[q.card.id] ?? q.card, binaryGrade(correct)) }));
  }

  function next() {
    setChosen(null);
    if (index + 1 >= questions.length) setDone(true);
    else setIndex(index + 1);
  }

  function finish(abandoned = false) {
    onFinish({ cards: finalCards, mode: "quiz", ...tally, abandoned });
  }

  // A quiz needs at least one wrong answer to choose between.
  if (cards.length < 2) {
    return (
      <GameShell title="Quiz" onExit={() => finish(true)}>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Quiz needs at least two cards so there's something to choose between.
        </p>
      </GameShell>
    );
  }

  if (done || !q) {
    const answered = tally.right + tally.wrong;
    const pct = answered ? Math.round((tally.right / answered) * 100) : 0;
    return (
      <GameShell title="Quiz" onExit={() => finish(true)}>
        <GameSummary
          title={pct >= 80 ? "Nicely done" : "Session complete"}
          stats={[
            { label: "Score", value: `${pct}%`, tone: pct >= 80 ? "good" : "neutral" },
            { label: "Correct", value: String(tally.right), tone: "good" },
            { label: "Missed", value: String(tally.wrong), tone: tally.wrong ? "bad" : "neutral" },
          ]}
          onReplay={() => {
            setIndex(0); setChosen(null); setTally({ right: 0, wrong: 0 });
            setDone(false); setRound((r) => r + 1);
          }}
          onDone={() => finish()}
        />
      </GameShell>
    );
  }

  return (
    <GameShell
      title="Quiz"
      subtitle={`Question ${index + 1} of ${questions.length}`}
      progress={index / questions.length}
      onExit={() => finish(true)}
    >
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-white/[0.09] bg-white/[0.02] p-7 text-center">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Term</span>
          <p key={q.card.id} className="mt-3 animate-pop text-balance text-2xl font-medium leading-snug">
            {q.card.front}
          </p>
        </div>

        <div className="mt-5 space-y-2.5">
          {q.options.map((option) => {
            const isAnswer = option === q.answer;
            const isChosen = option === chosen;
            const revealed = chosen !== null;
            return (
              <button
                key={option}
                onClick={() => choose(option)}
                disabled={revealed}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition-all",
                  !revealed && "border-white/[0.09] bg-white/[0.02] hover:-translate-y-[1px] hover:border-white/25",
                  // Once answered, always show where the right answer was —
                  // being told only "wrong" teaches nothing.
                  revealed && isAnswer && "border-success/50 bg-success/10",
                  revealed && isChosen && !isAnswer && "animate-shake border-destructive/50 bg-destructive/10",
                  revealed && !isAnswer && !isChosen && "border-white/[0.06] opacity-45",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                    revealed && isAnswer && "border-success bg-success text-success-foreground",
                    revealed && isChosen && !isAnswer && "border-destructive bg-destructive text-destructive-foreground",
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
      </div>
    </GameShell>
  );
}
