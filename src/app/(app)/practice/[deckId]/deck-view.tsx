"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Layers, Zap, ListChecks, Timer, Plus, Trash2, Pencil, Check, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input, Textarea } from "@/components/ui/input";
import { useAppData } from "@/lib/store/app-data";
import { deckMastery, dueCount, mastery } from "@/lib/practice/srs";
import { timeAgo } from "@/lib/format";
import { toast } from "@/components/ui/toaster";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import type { CardDTO, GameMode, Mastery } from "@/lib/types";
import { Flashcards } from "../games/flashcards";
import { MatchGame } from "../games/match";
import { Quiz } from "../games/quiz";
import { RecallRush } from "../games/rush";
import type { GameResult } from "../games/game-shell";

const MODES: {
  id: GameMode;
  label: string;
  blurb: string;
  icon: typeof Layers;
  minCards: number;
}[] = [
  { id: "flashcards", label: "Flashcards", blurb: "Flip and self-grade, scheduled by memory", icon: Layers, minCards: 1 },
  { id: "quiz", label: "Quiz", blurb: "Multiple choice — the gentlest way in", icon: ListChecks, minCards: 2 },
  { id: "match", label: "Match", blurb: "Pair terms to definitions against the clock", icon: Timer, minCards: 2 },
  { id: "rush", label: "Recall Rush", blurb: "60 seconds, type fast, keep the combo", icon: Zap, minCards: 1 },
];

const MASTERY_TONE: Record<Mastery, "muted" | "warning" | "primary" | "success"> = {
  new: "muted",
  learning: "warning",
  familiar: "primary",
  mastered: "success",
};

export function DeckView({ deckId }: { deckId: string }) {
  const { data, ready, recordSession, deleteDeck, updateDeck, setDeckCards } = useAppData();
  const router = useRouter();
  const [mode, setMode] = useState<GameMode | null>(null);
  const [editing, setEditing] = useState(false);

  const deck = useMemo(() => data.decks.find((d) => d.id === deckId), [data.decks, deckId]);

  if (!deck) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {ready ? "That deck no longer exists." : "Loading deck…"}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/practice")}>
          Back to Practice
        </Button>
      </div>
    );
  }

  async function handleFinish(result: GameResult) {
    setMode(null);
    // An abandoned run with nothing answered isn't worth a write.
    if (result.abandoned && result.right + result.wrong === 0) return;
    await recordSession(deck!.id, {
      cards: result.cards,
      mode: result.mode,
      score: result.score,
      elapsedMs: result.elapsedMs,
    });
  }

  if (mode) {
    const props = { cards: deck.cards, onFinish: handleFinish, onExit: () => setMode(null) };
    return (
      <div className="animate-fade-in">
        {mode === "flashcards" && <Flashcards {...props} />}
        {mode === "quiz" && <Quiz {...props} />}
        {mode === "match" && <MatchGame {...props} />}
        {mode === "rush" && <RecallRush {...props} best={deck.bestRushScore} />}
      </div>
    );
  }

  const pct = deckMastery(deck.cards);
  const due = dueCount(deck.cards);
  const courseName = data.courses.find((c) => c.id === deck.courseId)?.name;

  return (
    <div className="animate-fade-in">
      <Link
        href="/practice"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Practice
      </Link>

      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{deck.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="muted">{deck.cards.length} cards</Badge>
            {courseName && <Badge tone="muted">{courseName}</Badge>}
            {due > 0 && <Badge tone="primary">{due} due</Badge>}
            {deck.sessions > 0 && (
              <Badge tone="muted">
                {deck.sessions} session{deck.sessions === 1 ? "" : "s"}
                {deck.lastStudiedAt && ` · ${timeAgo(deck.lastStudiedAt)}`}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
            <Pencil className="h-4 w-4" /> {editing ? "Done" : "Edit cards"}
          </Button>
          <button
            onClick={async () => {
              const yes = await confirm({
                title: `Delete “${deck.title}”?`,
                body: "This removes the deck and all its cards. It can't be undone.",
                confirmLabel: "Delete deck",
                destructive: true,
              });
              if (!yes) return;
              await deleteDeck(deck.id);
              router.push("/practice");
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-input text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            aria-label="Delete deck"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Card className="mb-7 p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Deck mastery</span>
          <span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} tone={pct >= 80 ? "success" : "primary"} />
        <p className="mt-2.5 text-xs text-muted-foreground">
          A card counts as mastered after five correct answers in a row. Every game feeds this.
        </p>
      </Card>

      {editing ? (
        <CardEditor
          cards={deck.cards}
          onSave={async (cards) => {
            await setDeckCards(deck.id, cards);
            setEditing(false);
            toast("Cards saved", "success");
          }}
          onRenameDeck={(title) => updateDeck(deck.id, { title })}
          deckTitle={deck.title}
        />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Choose a game
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {MODES.map((m) => {
              const locked = deck.cards.length < m.minCards;
              return (
                <button
                  key={m.id}
                  onClick={() => !locked && setMode(m.id)}
                  disabled={locked}
                  className={cn(
                    "flex items-start gap-4 rounded-2xl border p-5 text-left transition-all",
                    locked
                      ? "cursor-not-allowed border-white/[0.05] opacity-45"
                      : "border-white/[0.09] bg-white/[0.02] hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-glow-sm",
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <m.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{m.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {locked ? `Needs at least ${m.minCards} cards` : m.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cards
          </h2>
          <Card className="divide-y divide-white/[0.05]">
            {deck.cards.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.front}</p>
                  <p className="truncate text-sm text-muted-foreground">{c.back}</p>
                </div>
                <Badge tone={MASTERY_TONE[mastery(c)]} className="shrink-0 capitalize">
                  {mastery(c)}
                </Badge>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

/** Inline card editor — add, edit and remove rows, then save the deck in one write. */
function CardEditor({
  cards,
  deckTitle,
  onSave,
  onRenameDeck,
}: {
  cards: CardDTO[];
  deckTitle: string;
  onSave: (cards: { front: string; back: string; hint?: string | null }[]) => Promise<void>;
  onRenameDeck: (title: string) => void;
}) {
  const [title, setTitle] = useState(deckTitle);
  const [rows, setRows] = useState(() =>
    cards.map((c) => ({ front: c.front, back: c.back, hint: c.hint ?? "" })),
  );
  const [saving, setSaving] = useState(false);

  const valid = rows.filter((r) => r.front.trim() && r.back.trim());

  function update(i: number, patch: Partial<(typeof rows)[number]>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== deckTitle && onRenameDeck(title.trim())}
          className="sm:max-w-sm"
          aria-label="Deck name"
        />
        <p className="text-xs text-muted-foreground">
          {valid.length} of {rows.length} rows will be saved — a card needs both sides.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={r.front}
              onChange={(e) => update(i, { front: e.target.value })}
              placeholder="Term"
              aria-label={`Card ${i + 1} term`}
            />
            <Textarea
              value={r.back}
              onChange={(e) => update(i, { back: e.target.value })}
              placeholder="Definition"
              rows={1}
              className="min-h-[40px] py-2"
              aria-label={`Card ${i + 1} definition`}
            />
            <button
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-xl border border-input text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              aria-label={`Remove card ${i + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((rs) => [...rs, { front: "", back: "", hint: "" }])}
        >
          <Plus className="h-4 w-4" /> Add card
        </Button>
        <Button
          size="sm"
          loading={saving}
          disabled={!valid.length}
          onClick={async () => {
            setSaving(true);
            await onSave(valid.map((r) => ({ front: r.front, back: r.back, hint: r.hint || null })));
            setSaving(false);
          }}
        >
          <Check className="h-4 w-4" /> Save cards
        </Button>
      </div>
    </div>
  );
}
