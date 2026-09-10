"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Layers, Flame, Clock, Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { useAppData } from "@/lib/store/app-data";
import { deckMastery, dueCount } from "@/lib/practice/srs";
import { timeAgo } from "@/lib/format";
import { CreateDeck } from "./create-deck";
import type { DeckDTO } from "@/lib/types";

export function PracticeView() {
  const { data } = useAppData();
  const [creating, setCreating] = useState(false);

  const decks = data.decks;
  const courseName = useMemo(
    () => new Map(data.courses.map((c) => [c.id, c.name])),
    [data.courses],
  );

  // One number that answers "is there anything to do right now?"
  const totalDue = useMemo(
    () => decks.reduce((n, d) => n + dueCount(d.cards), 0),
    [decks],
  );

  return (
    <>
      <PageHeader
        title="Practice"
        description="Turn what you're learning into decks, then drill them with games that actually make it stick."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New deck
          </Button>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="Paste a vocab list, or let LifeOS pull the key terms out of your notes. Then practise with flashcards, matching, quizzes and Recall Rush."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New deck
            </Button>
          }
        />
      ) : (
        <>
          {totalDue > 0 && (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-4 py-1.5 text-sm">
              <Flame className="h-4 w-4 text-primary" />
              <span className="font-medium">{totalDue} card{totalDue === 1 ? "" : "s"}</span>
              <span className="text-muted-foreground">ready to review</span>
            </p>
          )}

          <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            {decks.map((deck) => (
              <DeckTile
                key={deck.id}
                deck={deck}
                courseName={deck.courseId ? courseName.get(deck.courseId) : undefined}
              />
            ))}
          </div>
        </>
      )}

      <CreateDeck open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function DeckTile({ deck, courseName }: { deck: DeckDTO; courseName?: string }) {
  const mastered = deckMastery(deck.cards);
  const due = dueCount(deck.cards);

  return (
    <Link href={`/practice/${deck.id}`} className="focus-ring rounded-2xl">
      <Card interactive className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{deck.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}
              {deck.lastStudiedAt && ` · studied ${timeAgo(deck.lastStudiedAt)}`}
            </p>
          </div>
          {due > 0 && (
            <Badge tone="primary" className="shrink-0">
              {due} due
            </Badge>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Mastery</span>
            <span className="font-medium tabular-nums">{mastered}%</span>
          </div>
          <Progress value={mastered} tone={mastered >= 80 ? "success" : "primary"} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {courseName && <Badge tone="muted">{courseName}</Badge>}
          {deck.source === "ai" && <Badge tone="ai">AI</Badge>}
          {deck.bestRushScore > 0 && (
            <Badge tone="muted">
              <Trophy className="h-3 w-3" /> {deck.bestRushScore}
            </Badge>
          )}
          {deck.bestMatchMs != null && (
            <Badge tone="muted">
              <Clock className="h-3 w-3" /> {(deck.bestMatchMs / 1000).toFixed(1)}s
            </Badge>
          )}
        </div>
      </Card>
    </Link>
  );
}
