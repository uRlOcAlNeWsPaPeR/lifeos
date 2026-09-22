"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, PauseCircle, Play, RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { MultiChips, SingleChips } from "@/components/ui/choice-chips";
import { confirm } from "@/components/ui/confirm";
import { commit, useSat } from "@/lib/sat/store";
import { useCatalog } from "@/lib/sat/hooks";
import { getQuestions, pickFromCatalog } from "@/lib/sat/qbank";
import { DIFF_NAME, DOMAINS, SKILL_ORDER } from "@/lib/sat/constants";
import type { Difficulty, Section, TestKind } from "@/lib/sat/types";
import { SatHeader } from "./common";
import { useSatActions } from "./use-sat-actions";

type SectionChoice = "mixed" | Section;

export function PracticeBuilder() {
  const params = useSearchParams();
  const initial = params.get("section");
  const { s } = useSat();
  const catalog = useCatalog();
  const { busy, startSet, resumeSet } = useSatActions();

  const [test, setTest] = useState<TestKind>("sat");
  const [section, setSection] = useState<SectionChoice>(initial === "rw" || initial === "math" ? initial : "mixed");
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<Difficulty[]>([]);
  const [count, setCount] = useState<"5" | "10" | "15">("10");

  // Skills that actually exist for this test and section — the PSAT, for
  // example, has no circles questions — in College Board's own order.
  const skillOptions = useMemo(() => {
    if (section === "mixed" || !catalog.data) return [];
    const codes = new Set(catalog.data[test][section].map((r) => r[3]));
    return [...codes]
      .sort((a, b) => SKILL_ORDER.indexOf(a) - SKILL_ORDER.indexOf(b))
      .map((code) => ({ value: code, label: catalog.data!.skills[code] ?? code }));
  }, [catalog.data, test, section]);

  function start() {
    void startSet(
      "start",
      () =>
        pickFromCatalog(s, {
          test,
          section,
          domains: section === "mixed" || !domains.length ? "all" : domains,
          skills: section === "mixed" || !skills.length ? "all" : skills,
          diffs: diffs.length ? diffs : "any",
          count: +count,
        }),
      section,
    );
  }

  async function discard() {
    const yes = await confirm({
      title: "Discard this paused session?",
      body: "Its progress will be lost. This can't be undone.",
      confirmLabel: "Discard",
      destructive: true,
    });
    if (yes) commit((st) => { st.pausedQuiz = null; });
  }

  const p = s.pausedQuiz;
  const started = p ? new Date(p.startedISO) : null;

  return (
    <>
      <SatHeader
        title="Practice"
        description="Build a set from the College Board question bank — filter by test, section, domain, skill and difficulty."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {p && started && (
            <Card glow className="flex flex-wrap items-center gap-4 p-4">
              <PauseCircle className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.idx}/{p.qids.length} answered · started{" "}
                  {started.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at{" "}
                  {started.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={resumeSet} loading={busy === "resume"}>
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
                <Button size="sm" variant="ghost" onClick={discard} aria-label="Discard paused session">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          )}

          <Card className="space-y-6 p-5 sm:p-6">
            <Field label="Test">
              <SingleChips<TestKind>
                label="Test"
                value={test}
                onChange={(v) => {
                  setTest(v);
                  setSkills([]);
                }}
                options={[
                  { value: "sat", label: "SAT" },
                  { value: "psat", label: "PSAT/NMSQT" },
                ]}
              />
            </Field>

            <Field label="Section">
              <SingleChips<SectionChoice>
                label="Section"
                value={section}
                onChange={(v) => {
                  setSection(v);
                  setDomains([]);
                  setSkills([]);
                }}
                options={[
                  { value: "mixed", label: "Mixed" },
                  { value: "rw", label: "Reading & Writing" },
                  { value: "math", label: "Math" },
                ]}
              />
            </Field>

            {section === "mixed" ? (
              <p className="text-sm text-muted-foreground">
                Pick Reading &amp; Writing or Math to filter by domain and skill.
              </p>
            ) : (
              <>
                <Field label="Domain — pick one or more">
                  <MultiChips
                    label="Domain"
                    allLabel="All domains"
                    value={domains}
                    onChange={setDomains}
                    options={DOMAINS[section].map((d) => ({ value: d.code, label: d.name }))}
                  />
                </Field>
                <Field label="Skill — pick one or more">
                  {catalog.error ? (
                    <p className="text-sm text-destructive">Couldn&apos;t load the skill list — {catalog.error}.</p>
                  ) : !catalog.data ? (
                    <p className="text-sm text-muted-foreground">Loading skills…</p>
                  ) : (
                    <MultiChips label="Skill" allLabel="All skills" value={skills} onChange={setSkills} options={skillOptions} />
                  )}
                </Field>
              </>
            )}

            <Field label="Difficulty — pick one or more">
              <MultiChips<Difficulty>
                label="Difficulty"
                allLabel="Any"
                value={diffs}
                onChange={setDiffs}
                options={(["E", "M", "H"] as const).map((d) => ({ value: d, label: DIFF_NAME[d] }))}
              />
            </Field>

            <Field label="How many questions?">
              <SingleChips
                label="Question count"
                value={count}
                onChange={setCount}
                options={[
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                  { value: "15", label: "15" },
                ]}
              />
            </Field>

            <Button size="lg" onClick={start} loading={busy === "start"} className="w-full sm:w-auto">
              Start practice
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <p className="flex items-center gap-2 font-medium">
              <RotateCcw className="h-4 w-4 text-primary" />
              Review mistakes
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.missed.length
                ? `${s.missed.length} question${s.missed.length === 1 ? "" : "s"} you got wrong, waiting for another go.`
                : "No mistakes to review — nice."}
            </p>
            {s.missed.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                loading={busy === "mistakes"}
                onClick={() => startSet("mistakes", () => getQuestions(s.missed.slice(-15)), "mixed")}
              >
                Review my mistakes ({s.missed.length})
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
