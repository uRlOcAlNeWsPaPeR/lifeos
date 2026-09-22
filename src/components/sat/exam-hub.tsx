"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, ExternalLink, PauseCircle, Play, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { SingleChips } from "@/components/ui/choice-chips";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { commit, useSat } from "@/lib/sat/store";
import { EXAM_SPECS, LIBRARY_COUNT } from "@/lib/sat/constants";
import { formatClock, moduleLabel } from "@/lib/sat/exam";
import type { TestKind } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { SatHeader } from "./common";
import { useSatActions } from "./use-sat-actions";

export function ExamHub() {
  const { s } = useSat();
  const { busy, startExam, resumeExam } = useSatActions();
  const [libKind, setLibKind] = useState<TestKind>("sat");

  const ex = s.exam && s.exam.phase !== "done" ? s.exam : null;

  async function abandon() {
    const yes = await confirm({
      title: "Abandon this exam?",
      body: "Its progress will be lost and no score is recorded.",
      confirmLabel: "Abandon",
      destructive: true,
    });
    if (!yes) return;
    commit((st) => { st.exam = null; });
    toast("Exam abandoned.");
  }

  // Best score per library exam, for the chosen test.
  const best: Record<number, number> = {};
  for (const h of s.examHistory ?? []) {
    if (h.lib && h.kind === libKind) best[h.lib] = Math.max(best[h.lib] ?? 0, h.total);
  }

  return (
    <>
      <SatHeader
        title="Practice exams"
        description="The real digital format: four adaptive modules, live timers, a 10-minute break and a scaled score. Progress saves automatically — leave any time and pick up where you stopped."
      />

      <div className="space-y-6">
        {ex && (
          <Card glow className="flex flex-wrap items-center gap-4 p-4">
            <PauseCircle className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{EXAM_SPECS[ex.kind].label} exam in progress</p>
              <p className="text-xs text-muted-foreground">
                {ex.phase === "break"
                  ? `On break — ${formatClock(ex.breakLeft)} left, Math is next.`
                  : `${moduleLabel(ex)} · ${Object.keys(ex.modules[ex.cur].answers).length}/${ex.modules[ex.cur].total} answered · ${formatClock(ex.modules[ex.cur].timeLeft)} left`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={resumeExam}>
                <Play className="h-3.5 w-3.5" />
                Resume exam
              </Button>
              <Button size="sm" variant="ghost" onClick={abandon}>
                <Trash2 className="h-3.5 w-3.5" />
                Abandon
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(["sat", "psat"] as const).map((kind) => {
            const spec = EXAM_SPECS[kind];
            return (
              <Card key={kind} className="flex flex-col p-5">
                <p className="font-medium">{spec.label}</p>
                <dl className="mt-4 flex-1 divide-y divide-white/[0.06] text-sm">
                  {[
                    ["Reading & Writing", "2 × 27 questions · 32 min each"],
                    ["Break", `${spec.breakMinutes} minutes`],
                    ["Math", "2 × 22 questions · 35 min each"],
                    ["Score", `${spec.scale.min * 2}–${spec.scale.max * 2}`],
                    ["Total", "2 h 14 min · 98 questions"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Button className="mt-4" onClick={() => startExam(kind)} loading={busy === `exam-${kind}-new`}>
                  Start {spec.shortLabel} exam
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="p-5">
          <SectionTitle
            right={
              <SingleChips<TestKind>
                label="Library test"
                value={libKind}
                onChange={setLibKind}
                options={[
                  { value: "sat", label: "SAT" },
                  { value: "psat", label: "PSAT/NMSQT" },
                ]}
              />
            }
          >
            Exam library
          </SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Numbered full-length exams built from the College Board question bank. Each always has the same questions, so you can retake it and compare.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: LIBRARY_COUNT }, (_, i) => i + 1).map((n) => {
              const inProgress = ex && ex.lib === n && ex.kind === libKind;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => (inProgress ? resumeExam() : startExam(libKind, n))}
                  disabled={busy === `exam-${libKind}-${n}`}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors hover:border-primary/40",
                    best[n] ? "border-success/30 bg-success/[0.05]" : inProgress ? "border-primary/40 bg-primary/[0.06]" : "border-white/[0.08]",
                  )}
                >
                  <p className="text-sm font-medium">{EXAM_SPECS[libKind].shortLabel} Exam {n}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {best[n] ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-success" />Best score {best[n]}</>
                    ) : inProgress ? (
                      <><PauseCircle className="h-3.5 w-3.5 text-primary" />In progress</>
                    ) : (
                      "98 questions · 2 h 14 min"
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Past results</SectionTitle>
          {s.examHistory?.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {[...s.examHistory].reverse().slice(0, 8).map((h, i) => (
                <li key={`${h.date}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="font-medium">{EXAM_SPECS[h.kind].label}{h.lib ? ` · Exam ${h.lib}` : ""}</span>
                  <span className="text-muted-foreground">{h.date}</span>
                  <span className="text-xs text-muted-foreground">R&amp;W {h.rw} · Math {h.math}</span>
                  <Badge tone="primary" className="ml-auto">{h.total}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ClipboardList} title="No finished exams yet" description="Your scores will show up here." />
          )}
        </Card>

        <p className="text-sm text-muted-foreground">
          Want more practice tests, or ones closer to the real thing? Try{" "}
          <a href="https://bluebooky.org" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Bluebooky <ExternalLink className="h-3 w-3" />
          </a>
          .
        </p>
      </div>
    </>
  );
}
