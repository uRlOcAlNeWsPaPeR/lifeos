"use client";

import { useMemo, useState } from "react";
import { Compass, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/misc";
import { useSat } from "@/lib/sat/store";
import { useCatalog } from "@/lib/sat/hooks";
import { catalogRows } from "@/lib/sat/qbank";
import { domainBreakdown, prediction, skillRows, todayStr } from "@/lib/sat/engine";
import { EXAM_SPECS, SECTION_NAME } from "@/lib/sat/constants";
import { cn } from "@/lib/utils";
import { AccuracyRows, LoadingBlock, SatHeader } from "./common";
import { LogExamDialog } from "./log-exam";

export function SatProgress() {
  const { s, version } = useSat();
  const catalog = useCatalog();
  const [logging, setLogging] = useState(false);

  const external = useMemo(
    () => [...(s.external ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [s.external, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const avg = external.length ? Math.round(external.reduce((a, e) => a + e.total, 0) / external.length) : null;
  const n = s.counters.answered;

  return (
    <>
      <SatHeader title="Progress" description="Your predicted score, where you're strong, and what to focus on next." />

      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle>Predicted score</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["sat", "psat"] as const).map((k) => {
              const p = prediction(s, k);
              return (
                <div key={k} className="rounded-xl border border-white/[0.07] p-4">
                  <p className="text-sm text-muted-foreground">{EXAM_SPECS[k].label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                    {p.lo}–{p.hi}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Most likely ~{p.est}
                    {p.gap != null && (p.gap > 0 ? ` · ${p.gap} pts below your ${p.target} target` : " · on track for your target")}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Based on {n} answered question{n === 1 ? "" : "s"}, weighted by difficulty. Answer more and take full exams to tighten the range.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle
            right={
              <Button variant="ghost" size="sm" onClick={() => setLogging(true)}>
                <Plus className="h-3.5 w-3.5" />
                Log an exam
              </Button>
            }
          >
            Outside exams
          </SectionTitle>
          {external.length ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {external.length} logged · average <strong className="text-foreground">{avg}</strong>
              </p>
              <ul className="divide-y divide-white/[0.06]">
                {external.map((e, i) => (
                  <li key={`${e.date}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className="font-medium">{e.source}</span>
                    <span className="text-muted-foreground">{e.date}</span>
                    <span className="text-xs text-muted-foreground">R&amp;W {e.rw} · Math {e.math}</span>
                    <Badge tone="primary" className="ml-auto">{e.total}</Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Compass className="h-4 w-4" />
              Took a full-length test somewhere else? Log it so it counts toward your stats.
            </p>
          )}
        </Card>

        <section>
          <SectionTitle>Strengths &amp; weaknesses</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {(["rw", "math"] as const).map((sec) => (
              <Card key={sec} className="p-5">
                <p className="mb-4 font-medium">{SECTION_NAME[sec]}</p>
                <AccuracyRows
                  rows={domainBreakdown(s.domains, sec).map((d) => ({ key: d.code, label: d.desc, acc: d.acc, att: d.att, tag: d.tag }))}
                />
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>By skill</SectionTitle>
          {!catalog.data ? (
            <LoadingBlock label="Loading skills…" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(["rw", "math"] as const).map((sec) => (
                <Card key={sec} className="p-5">
                  <p className="mb-4 font-medium">{SECTION_NAME[sec]}</p>
                  <AccuracyRows
                    rows={skillRows(s, catalogRows(catalog.data!, "sat", sec)).map((r) => ({ key: r.code, label: r.desc, acc: r.acc, att: r.att }))}
                  />
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card className="p-5">
          <SectionTitle>Activity — last 4 weeks</SectionTitle>
          <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(14,minmax(0,1fr))]" aria-label="Questions answered per day">
            {Array.from({ length: 28 }, (_, n) => {
              const d = todayStr(-(27 - n));
              const count = s.history[d]?.answered ?? 0;
              const lvl = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3;
              return (
                <li
                  key={d}
                  title={`${d}: ${count} questions`}
                  aria-label={`${d}: ${count} questions`}
                  className={cn(
                    "aspect-square rounded-md border",
                    lvl === 0 && "border-white/[0.06] bg-white/[0.02]",
                    lvl === 1 && "border-primary/20 bg-primary/20",
                    lvl === 2 && "border-primary/40 bg-primary/45",
                    lvl === 3 && "border-primary/60 bg-primary/80",
                  )}
                />
              );
            })}
          </ol>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            Less
            {["bg-white/[0.02]", "bg-primary/20", "bg-primary/45", "bg-primary/80"].map((c) => (
              <span key={c} className={cn("h-3 w-3 rounded-sm border border-white/10", c)} />
            ))}
            More
          </p>
        </Card>
      </div>

      <LogExamDialog open={logging} onClose={() => setLogging(false)} />
    </>
  );
}
