"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { commit, useSat } from "@/lib/sat/store";
import { catalogRows, getQuestions, loadCatalog } from "@/lib/sat/qbank";
import { qotdCandidates, todayStr } from "@/lib/sat/engine";
import { SECTION_NAME } from "@/lib/sat/constants";
import type { Question, Section } from "@/lib/sat/types";
import { LETTERS, OptionRow, QuestionHtml, Sheet, type OptionState } from "./question";
import { ErrorBlock, LoadingBlock } from "./common";

/** Today's question for a section: stable all day, the same for everyone. */
async function pickQotd(section: Section): Promise<Question | null> {
  const catalog = await loadCatalog();
  const rows = catalogRows(catalog, "sat", section);
  for (const i of qotdCandidates(todayStr(), section, rows.length)) {
    const [q] = await getQuestions([rows[i].key]);
    if (q && q.type === "mcq") return q;
  }
  return null;
}

export function QuestionOfTheDay({ section }: { section: Section }) {
  const { s } = useSat();
  const [q, setQ] = useState<Question | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const day = todayStr();

  useEffect(() => {
    let alive = true;
    setError(false);
    pickQotd(section)
      .then((res) => {
        if (!alive) return;
        if (res) setQ(res);
        else setError(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [section, day, attempt]);

  const picked = s.qotd?.date === day ? s.qotd.picks[section] : undefined;

  function pick(letter: string) {
    commit((st) => {
      if (!st.qotd || st.qotd.date !== day) st.qotd = { date: day, picks: {} };
      st.qotd.picks[section] = letter;
    });
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{SECTION_NAME[section]}</h3>
      {error ? (
        <ErrorBlock message="Couldn't load today's question — check your connection." onRetry={() => setAttempt((n) => n + 1)} />
      ) : !q ? (
        <LoadingBlock label="Loading today's question…" className="py-8" />
      ) : (
        <Sheet className="space-y-4">
          {q.stimulus && <QuestionHtml html={q.stimulus} className="text-sm" />}
          <QuestionHtml html={q.stem} className="text-sm font-semibold" />
          <div className="space-y-2">
            {LETTERS.map((L, i) => {
              let state: OptionState = "idle";
              if (picked) {
                if (q.correct.includes(L)) state = "correct";
                else if (L === picked) state = "wrong";
              }
              return (
                <OptionRow
                  key={L}
                  letter={L}
                  html={q.options[i]}
                  state={state}
                  disabled={Boolean(picked)}
                  onSelect={picked ? undefined : () => pick(L)}
                />
              );
            })}
          </div>
          {picked && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                {q.correct.includes(picked) ? (
                  <><CheckCircle2 className="h-4 w-4 text-success" /> Correct.</>
                ) : (
                  <><XCircle className="h-4 w-4 text-destructive" /> Not quite — the answer is {q.correct.join(" or ")}.</>
                )}
              </p>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-primary">
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  Explanation
                </summary>
                <QuestionHtml html={q.rationale} className="mt-2 text-sm text-muted-foreground" />
              </details>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
