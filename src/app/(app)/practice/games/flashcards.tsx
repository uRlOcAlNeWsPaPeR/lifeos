"use client";

import { useMemo, useState } from "react";
import { Eye, Lightbulb, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildQueue, intervalDays, review } from "@/lib/practice/srs";
import { cn } from "@/lib/utils";
import type { CardDTO, Grade } from "@/lib/types";
import { GameShell, GameSummary, type GameProps } from "./game-shell";

const SESSION_LIMIT = 25;

/** The four self-grade buttons, in the order they're shown. */
const GRADES: { grade: Grade; label: string; hint: string; className: string }[] = [
  { grade: "again", label: "Again", hint: "No idea", className: "border-destructive/40 text-destructive hover:bg-destructive/10" },
  { grade: "hard", label: "Hard", hint: "Struggled", className: "border-warning/40 text-warning hover:bg-warning/10" },
  { grade: "good", label: "Good", hint: "Got it", className: "border-primary/40 text-primary hover:bg-primary/10" },
  { grade: "easy", label: "Easy", hint: "Instant", className: "border-success/40 text-success hover:bg-success/10" },
];

/**
 * Classic flashcards, driven by the spaced-repetition scheduler: the student
 * grades their own recall and the card's next appearance moves accordingly.
 * A card graded "Again" comes back at the end of this same session.
 */
export function Flashcards({ cards, onFinish, onExit }: GameProps) {
  // The working set for this sitting: due cards first, capped so a big deck
  // doesn't turn into an hour-long queue.
  const [queue, setQueue] = useState<CardDTO[]>(() => buildQueue(cards, new Date(), SESSION_LIMIT));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // Card id → its post-review state. Applied over the deck at the end.
  const [updates, setUpdates] = useState<Record<string, CardDTO>>({});
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [done, setDone] = useState(false);

  const card = queue[index];
  const total = queue.length;

  const finalCards = useMemo(
    () => cards.map((c) => updates[c.id] ?? c),
    [cards, updates],
  );

  function grade(g: Grade) {
    if (!card) return;
    const updated = review(updates[card.id] ?? card, g);
    const nextUpdates = { ...updates, [card.id]: updated };
    setUpdates(nextUpdates);
    setTally((t) => (g === "again" ? { ...t, wrong: t.wrong + 1 } : { ...t, right: t.right + 1 }));

    // "Again" earns another look before the session ends.
    const requeue = g === "again";
    const nextQueue = requeue ? [...queue, card] : queue;
    if (requeue) setQueue(nextQueue);

    setFlipped(false);
    setShowHint(false);

    if (index + 1 >= nextQueue.length) setDone(true);
    else setIndex(index + 1);
  }

  function restart() {
    setQueue(buildQueue(finalCards, new Date(), SESSION_LIMIT));
    setIndex(0);
    setFlipped(false);
    setShowHint(false);
    setUpdates({});
    setTally({ right: 0, wrong: 0 });
    setDone(false);
  }

  function finish(abandoned = false) {
    onFinish({ cards: finalCards, mode: "flashcards", ...tally, abandoned });
  }

  if (done || !card) {
    const reviewed = tally.right + tally.wrong;
    return (
      <GameShell title="Flashcards" onExit={() => finish(true)}>
        <GameSummary
          title={reviewed ? "Session complete" : "Nothing to review"}
          stats={[
            { label: "Reviewed", value: String(reviewed) },
            { label: "Knew it", value: String(tally.right), tone: "good" },
            { label: "Missed", value: String(tally.wrong), tone: tally.wrong ? "bad" : "neutral" },
          ]}
          onReplay={restart}
          onDone={() => finish()}
        />
      </GameShell>
    );
  }

  const nextGap = (g: Grade) => {
    const after = review(updates[card.id] ?? card, g);
    const days = intervalDays(after.streak, after.ease);
    return days === 0 ? "10m" : days === 1 ? "1d" : `${days}d`;
  };

  return (
    <GameShell
      title="Flashcards"
      subtitle={`Card ${index + 1} of ${total}`}
      progress={index / total}
      onExit={() => finish(true)}
    >
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => setFlipped((f) => !f)}
          className={cn(
            "flex min-h-[260px] w-full flex-col items-center justify-center gap-4 rounded-3xl border p-8 text-center transition-all duration-300",
            flipped
              ? "border-primary/30 bg-primary/[0.06]"
              : "border-white/[0.09] bg-white/[0.02] hover:border-white/20",
          )}
        >
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {flipped ? "Answer" : "Term"}
          </span>
          <p
            key={flipped ? "back" : "front"}
            className="animate-pop text-balance text-2xl font-medium leading-snug"
          >
            {flipped ? card.back : card.front}
          </p>

          {!flipped && showHint && card.hint && (
            <p className="animate-fade-in text-sm text-muted-foreground">{card.hint}</p>
          )}

          {!flipped && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> Tap to reveal
            </span>
          )}
        </button>

        {!flipped && card.hint && !showHint && (
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowHint(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Lightbulb className="h-3.5 w-3.5" /> Show hint
            </button>
          </div>
        )}

        {flipped ? (
          <div className="mt-6 animate-slide-up">
            <p className="mb-2.5 text-center text-xs uppercase tracking-wide text-muted-foreground">
              How well did you know it?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  onClick={() => grade(g.grade)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl border bg-white/[0.02] px-3 py-3 transition-all hover:-translate-y-[1px]",
                    g.className,
                  )}
                >
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-[11px] text-muted-foreground">{g.hint}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                    +{nextGap(g.grade)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => setFlipped(true)}>
              <RotateCcw className="h-4 w-4" /> Flip card
            </Button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
