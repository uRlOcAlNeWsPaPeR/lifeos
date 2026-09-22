"use client";

import { useMemo } from "react";
import { PartyPopper, Play, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { useSat } from "@/lib/sat/store";
import { useCatalog } from "@/lib/sat/hooks";
import { catalogRows, getQuestions } from "@/lib/sat/qbank";
import { SECTION_NAME } from "@/lib/sat/constants";
import type { CatalogRow } from "@/lib/sat/types";
import { ErrorBlock, LoadingBlock, SatHeader } from "./common";
import { DifficultyBadge } from "./question";
import { useSatActions } from "./use-sat-actions";

/** How many recent mistakes one review set covers — ScoreClimb's number. */
const REVIEW_SET = 15;

export function ReviewMistakes() {
  const { s } = useSat();
  const catalog = useCatalog();
  const { busy, startSet } = useSatActions();

  // Most recent first, described from the catalog so the list is instant.
  const rows = useMemo(() => {
    if (!catalog.data) return [];
    const byKey = new Map<string, CatalogRow>();
    for (const t of ["sat", "psat"] as const) for (const r of catalogRows(catalog.data, t, "all")) byKey.set(r.key, r);
    return [...s.missed].reverse().map((key) => ({ key, row: byKey.get(key) }));
  }, [catalog.data, s.missed]);

  return (
    <>
      <SatHeader
        title="Review mistakes"
        description="Every question you got wrong, until you get it right. Answer one correctly and it leaves this list."
        action={
          s.missed.length > 0 && (
            <Button
              onClick={() => startSet("mistakes", () => getQuestions(s.missed.slice(-REVIEW_SET)), "mixed")}
              loading={busy === "mistakes"}
            >
              <RotateCcw className="h-4 w-4" />
              Review {Math.min(REVIEW_SET, s.missed.length)} most recent
            </Button>
          )
        }
      />

      {!s.missed.length ? (
        <EmptyState icon={PartyPopper} title="No mistakes to review" description="Anything you answer wrong in practice or an exam shows up here." />
      ) : catalog.error ? (
        <ErrorBlock message={`Couldn't load question details — ${catalog.error}.`} onRetry={catalog.retry} />
      ) : !catalog.data ? (
        <LoadingBlock label="Loading your mistakes…" />
      ) : (
        <Card className="p-0">
          <p className="border-b border-white/[0.06] px-5 py-3 text-sm text-muted-foreground">
            {s.missed.length} question{s.missed.length === 1 ? "" : "s"} to revisit
          </p>
          <ul className="divide-y divide-white/[0.06]">
            {rows.map(({ key, row }) => {
              const given = s.missedAnswers[key];
              return (
                <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row?.skillDesc ?? "Question"}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {row && <span className="font-mono">{row.qid}</span>}
                      {row && <Badge tone="muted">{SECTION_NAME[row.section]}</Badge>}
                      {row && <DifficultyBadge d={row.difficulty} />}
                      {given && <span>You answered: {given}</span>}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startSet(`one-${key}`, () => getQuestions([key]), "mixed", "That question isn't available right now.")}
                    loading={busy === `one-${key}`}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
