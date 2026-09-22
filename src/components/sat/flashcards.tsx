"use client";

import { useMemo, useState } from "react";
import { Check, Layers, RotateCcw, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SingleChips } from "@/components/ui/choice-chips";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { commit, useSat } from "@/lib/sat/store";
import { useGuides, useStudyTimer, useVocab } from "@/lib/sat/hooks";
import { flashBox, gradeFlash } from "@/lib/sat/engine";
import type { Guide } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { ErrorBlock, LoadingBlock, SatHeader } from "./common";

type Deck = "vocab" | "roots";

interface FlashCard {
  id: string;
  front: string;
  back: string;
}

/** Roots come from the table in the English study guide's Latin & Greek section. */
function rootCards(guides: Guide[]): FlashCard[] {
  const g = guides.find((x) => x.id === "english");
  const sec = g?.sections.find((x) => /Latin and Greek/i.test(x.t));
  if (!sec) return [];
  const doc = new DOMParser().parseFromString(sec.html, "text/html");
  const out: FlashCard[] = [];
  doc.querySelectorAll("tr").forEach((tr) => {
    const td = tr.querySelectorAll("td");
    if (td.length >= 3) {
      const front = (td[0].textContent ?? "").trim();
      out.push({
        id: `r:${front}`,
        front,
        back: `${(td[1].textContent ?? "").trim()}\n\nExamples: ${(td[2].textContent ?? "").trim()}`,
      });
    }
  });
  return out;
}

export function Flashcards() {
  const { s, version } = useSat();
  const vocab = useVocab();
  const guides = useGuides();
  const [deck, setDeck] = useState<Deck>("vocab");
  const [queue, setQueue] = useState<FlashCard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);

  useStudyTimer(queue !== null);

  const cards = useMemo<FlashCard[]>(() => {
    if (deck === "vocab") return (vocab.data ?? []).map(([w, d]) => ({ id: `v:${w}`, front: w, back: d }));
    return guides.data ? rootCards(guides.data) : [];
  }, [deck, vocab.data, guides.data]);

  const source = deck === "vocab" ? vocab : guides;
  const mastered = useMemo(
    () => cards.filter((c) => flashBox(s, c.id) >= 3).length,
    [cards, s, version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function start() {
    const pool = cards.filter((c) => flashBox(s, c.id) < 3);
    if (!pool.length) return toast("You've mastered every card in this deck.", "success");
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setQueue(pool.slice(0, 20));
    setReviewed(0);
    setFlipped(false);
    setDone(false);
  }

  function grade(known: boolean) {
    if (!queue?.length) return;
    const [cur, ...rest] = queue;
    commit((st) => gradeFlash(st, cur.id, known));
    // A card you're still learning comes back later this session.
    const next = known ? rest : [...rest, cur];
    if (known) setReviewed((n) => n + 1);
    setFlipped(false);
    if (!next.length) {
      setQueue(null);
      setDone(true);
    } else setQueue(next);
  }

  async function reset() {
    const yes = await confirm({
      title: "Reset flashcard progress?",
      body: "Every card in both decks goes back to unlearned.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (yes) commit((st) => { st.flash = {}; });
  }

  const cur = queue?.[0];

  return (
    <>
      <SatHeader title="Flashcards" description="SAT vocabulary and Latin & Greek roots. Cards you know climb the boxes; misses come straight back." />

      <div className="mx-auto max-w-2xl space-y-5">
        <SingleChips<Deck>
          label="Deck"
          value={deck}
          onChange={(d) => {
            setDeck(d);
            setQueue(null);
            setDone(false);
          }}
          options={[{ value: "vocab", label: "SAT vocab" }, { value: "roots", label: "Latin & Greek roots" }]}
        />

        {source.error ? (
          <ErrorBlock message={`Couldn't load this deck — ${source.error}.`} onRetry={source.retry} />
        ) : source.loading ? (
          <LoadingBlock label="Loading the deck…" />
        ) : (
          <Card className="p-5 sm:p-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{mastered} / {cards.length} mastered</span>
              {cur && <span className="text-muted-foreground">{queue!.length} left</span>}
            </div>
            <Progress value={cards.length ? (mastered / cards.length) * 100 : 0} />

            {cur ? (
              <div className="mt-6 space-y-4">
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  aria-label={flipped ? "Show the word" : "Show the definition"}
                  className={cn(
                    "flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border p-6 text-center transition-colors",
                    flipped ? "border-primary/30 bg-primary/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20",
                  )}
                >
                  {flipped ? (
                    <span className="whitespace-pre-line text-base leading-relaxed">{cur.back}</span>
                  ) : (
                    <span className="text-3xl font-semibold tracking-tight">{cur.front}</span>
                  )}
                  <span className="mt-4 text-xs text-muted-foreground">{flipped ? "Tap to see the word" : "Tap to flip"}</span>
                </button>
                {flipped && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => grade(false)}>
                      <Undo2 className="h-4 w-4" />
                      Still learning
                    </Button>
                    <Button onClick={() => grade(true)}>
                      <Check className="h-4 w-4" />
                      Got it
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {done && <p className="text-sm">Session complete — {reviewed} card{reviewed === 1 ? "" : "s"} reviewed.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={start} disabled={!cards.length}>
                    <Layers className="h-4 w-4" />
                    Study 20 cards
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    <RotateCcw className="h-4 w-4" />
                    Reset progress
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
