"use client";

import { useMemo, useState } from "react";
import { Plus, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  GPA_LETTERS,
  LETTER_SCALE,
  courseGrade,
  fmtPct,
  gpaFromLetter,
  gradedWithPoints,
  letterFromPct,
  neededOnFinal,
  num,
  pointsPct,
  weightedPct,
  type LetterScaleEntry,
} from "@/lib/grades";
import type { CourseDTO } from "@/lib/types";

type Tab = "predict" | "weighted" | "points" | "final" | "gpa";

const TABS: { id: Tab; label: string }[] = [
  { id: "predict", label: "Predict" },
  { id: "weighted", label: "Weighted categories" },
  { id: "points", label: "Points" },
  { id: "final", label: "Final exam" },
  { id: "gpa", label: "GPA" },
];

export function GradeCalculators({
  courses,
  scale = LETTER_SCALE,
}: {
  courses: CourseDTO[];
  /** The student's chosen percent→letter cutoffs (Settings → School). */
  scale?: LetterScaleEntry[];
}) {
  const [tab, setTab] = useState<Tab>("predict");

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Work out where you stand and what you need — nothing here is saved.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary/15 text-accent-foreground ring-1 ring-inset ring-primary/25"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "predict" && <PredictCalc courses={courses} scale={scale} />}
        {tab === "weighted" && <WeightedCalc scale={scale} />}
        {tab === "points" && <PointsCalc courses={courses} scale={scale} />}
        {tab === "final" && <FinalCalc courses={courses} scale={scale} />}
        {tab === "gpa" && <GpaCalc courses={courses} />}
      </div>
    </div>
  );
}

/* -------------------------------- shared UI ------------------------------- */

function Result({
  pct,
  caption,
  tone = "primary",
  scale = LETTER_SCALE,
}: {
  pct: number | null;
  caption?: string;
  tone?: "primary" | "warning" | "success";
  scale?: LetterScaleEntry[];
}) {
  const letter = letterFromPct(pct, scale);
  return (
    <div
      className={cn(
        "mt-5 flex items-baseline gap-3 rounded-xl border p-4",
        tone === "warning"
          ? "border-warning/25 bg-warning/[0.06]"
          : tone === "success"
            ? "border-success/25 bg-success/[0.06]"
            : "border-primary/25 bg-primary/[0.06]",
      )}
    >
      <span className="text-3xl font-semibold tracking-tight">{pct == null ? "—" : fmtPct(pct)}</span>
      {letter && <span className="text-lg font-medium text-muted-foreground">{letter}</span>}
      {caption && <span className="ml-auto text-xs text-muted-foreground">{caption}</span>}
    </div>
  );
}

function RowShell({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <button
        onClick={onRemove}
        disabled={!onRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
        aria-label="Remove row"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CoursePicker({
  courses,
  onPick,
  label = "Load from a course",
}: {
  courses: CourseDTO[];
  onPick: (c: CourseDTO) => void;
  label?: string;
}) {
  if (courses.length === 0) return null;
  return (
    <Select
      className="h-8 w-auto text-xs"
      value=""
      onChange={(e) => {
        const c = courses.find((x) => x.id === e.target.value);
        if (c) onPick(c);
      }}
    >
      <option value="">{label}…</option>
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

const n = (v: string) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

/* --------------------------------- predict -------------------------------- */

interface PredictRow {
  id: string;
  title: string;
  possible: number;
  /** "" = no guess entered yet — excluded from the predicted grade, same as
   *  an assignment that isn't graded in real life. */
  predicted: string;
  /** What `predicted` started as (the real earned score, or "" if ungraded) —
   *  what the per-row reset button puts back. */
  original: string;
  wasGraded: boolean;
}

function PredictCalc({ courses, scale }: { courses: CourseDTO[]; scale: LetterScaleEntry[] }) {
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [rows, setRows] = useState<PredictRow[]>([]);

  const real = course ? courseGrade(course, scale) : null;

  const loadCourse = (c: CourseDTO) => {
    setCourse(c);
    const withPoints = c.assignments.filter(
      (a) => a.pointsPossible != null && a.pointsPossible > 0,
    );
    setRows(
      withPoints.map((a) => {
        const original =
          a.status === "graded" && a.pointsEarned != null ? String(a.pointsEarned) : "";
        return {
          id: a.id,
          title: a.title,
          possible: a.pointsPossible!,
          predicted: original,
          original,
          wasGraded: a.status === "graded",
        };
      }),
    );
  };

  const setPredicted = (id: string, predicted: string) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, predicted } : row)));

  const resetRow = (id: string) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, predicted: row.original } : row)));

  const guessed = rows.filter((r) => r.predicted.trim() !== "");
  const pct = pointsPct(guessed.map((r) => ({ earned: n(r.predicted), possible: r.possible })));
  const pending = rows.length - guessed.length;
  const delta = pct != null && real?.pct != null ? Math.round((pct - real.pct) * 10) / 10 : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Pick a class, then change any score — nothing here touches your real grades
        </p>
        <CoursePicker courses={courses} onPick={loadCourse} label="Predict a course" />
      </div>

      {!course ? (
        <p className="text-sm text-muted-foreground">Pick a course above to start predicting.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {course.name} doesn&apos;t have any assignments with points yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
                {!row.wasGraded && (
                  <Badge tone="muted" className="shrink-0">
                    not graded yet
                  </Badge>
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    className="h-8 w-16 text-center"
                    inputMode="decimal"
                    placeholder="?"
                    value={row.predicted}
                    onChange={(e) => setPredicted(row.id, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">/ {num(row.possible)}</span>
                </div>
                <button
                  onClick={() => resetRow(row.id)}
                  disabled={row.predicted === row.original}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label={`Reset ${row.title} to its real grade`}
                  title="Reset to real grade"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Result pct={real?.pct ?? null} caption="Current (real)" scale={scale} />
            <Result
              pct={pct}
              scale={scale}
              tone={
                pct == null || delta == null ? "primary" : delta >= 0 ? "success" : "warning"
              }
              caption={
                pending > 0
                  ? `Predicted · ${pending} more not guessed yet`
                  : delta == null
                    ? "Predicted"
                    : delta === 0
                      ? "Predicted · no change"
                      : `Predicted · ${delta > 0 ? "+" : ""}${num(delta)} vs. now`
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------- weighted categories ------------------------- */

interface WRow {
  id: string;
  name: string;
  weight: string;
  score: string;
}

const rid = () => Math.random().toString(36).slice(2);

function WeightedCalc({ scale }: { scale: LetterScaleEntry[] }) {
  const [rows, setRows] = useState<WRow[]>([
    { id: rid(), name: "Tests", weight: "50", score: "" },
    { id: rid(), name: "Homework", weight: "30", score: "" },
    { id: rid(), name: "Participation", weight: "20", score: "" },
  ]);

  const set = (id: string, patch: Partial<WRow>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const parsed = rows.map((r) => ({ weight: n(r.weight), score: n(r.score) }));
  const { pct, totalWeight } = weightedPct(parsed);
  const weightOff = totalWeight > 0 && Math.abs(totalWeight - 100) > 0.5;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Category · weight % · your average %
        </p>
      </div>

      {rows.map((row) => (
        <RowShell
          key={row.id}
          onRemove={rows.length > 1 ? () => setRows((r) => r.filter((x) => x.id !== row.id)) : undefined}
        >
          <Input
            className="h-9 flex-1"
            placeholder="Category"
            value={row.name}
            onChange={(e) => set(row.id, { name: e.target.value })}
          />
          <Input
            className="h-9 w-20 text-center"
            inputMode="decimal"
            placeholder="wt %"
            value={row.weight}
            onChange={(e) => set(row.id, { weight: e.target.value })}
          />
          <Input
            className="h-9 w-20 text-center"
            inputMode="decimal"
            placeholder="score"
            value={row.score}
            onChange={(e) => set(row.id, { score: e.target.value })}
          />
        </RowShell>
      ))}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setRows((r) => [...r, { id: rid(), name: "", weight: "", score: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add category
      </Button>

      <Result
        pct={pct}
        scale={scale}
        tone={weightOff ? "warning" : "primary"}
        caption={
          totalWeight === 0
            ? "Enter weights and scores"
            : weightOff
              ? `Weights add up to ${num(totalWeight)}% — normalised to what's entered`
              : "Weighted average"
        }
      />
    </div>
  );
}

/* -------------------------------- points -------------------------------- */

interface PRow {
  id: string;
  name: string;
  earned: string;
  possible: string;
}

function PointsCalc({ courses, scale }: { courses: CourseDTO[]; scale: LetterScaleEntry[] }) {
  const [rows, setRows] = useState<PRow[]>([{ id: rid(), name: "", earned: "", possible: "" }]);

  const set = (id: string, patch: Partial<PRow>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const loadCourse = (c: CourseDTO) => {
    const graded = gradedWithPoints(c);
    if (graded.length === 0) {
      setRows([{ id: rid(), name: `${c.name} — no graded assignments`, earned: "", possible: "" }]);
      return;
    }
    setRows(
      graded.map((a) => ({
        id: rid(),
        name: a.title,
        earned: String(a.pointsEarned ?? ""),
        possible: String(a.pointsPossible ?? ""),
      })),
    );
  };

  const parsed = rows.map((r) => ({ earned: n(r.earned), possible: n(r.possible) }));
  const pct = pointsPct(parsed);
  const totalEarned = parsed.reduce((s, r) => s + (r.possible > 0 ? r.earned : 0), 0);
  const totalPossible = parsed.reduce((s, r) => s + r.possible, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Assignment · points earned / possible</p>
        <CoursePicker courses={courses} onPick={loadCourse} />
      </div>

      {rows.map((row) => (
        <RowShell
          key={row.id}
          onRemove={rows.length > 1 ? () => setRows((r) => r.filter((x) => x.id !== row.id)) : undefined}
        >
          <Input
            className="h-9 flex-1"
            placeholder="Name (optional)"
            value={row.name}
            onChange={(e) => set(row.id, { name: e.target.value })}
          />
          <Input
            className="h-9 w-20 text-center"
            inputMode="decimal"
            placeholder="got"
            value={row.earned}
            onChange={(e) => set(row.id, { earned: e.target.value })}
          />
          <span className="text-muted-foreground">/</span>
          <Input
            className="h-9 w-20 text-center"
            inputMode="decimal"
            placeholder="out of"
            value={row.possible}
            onChange={(e) => set(row.id, { possible: e.target.value })}
          />
        </RowShell>
      ))}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setRows((r) => [...r, { id: rid(), name: "", earned: "", possible: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add row
      </Button>

      <Result
        pct={pct}
        scale={scale}
        caption={totalPossible > 0 ? `${num(totalEarned)} / ${num(totalPossible)} points` : "Enter some points"}
      />
    </div>
  );
}

/* ------------------------------ final exam ------------------------------ */

function FinalCalc({ courses, scale }: { courses: CourseDTO[]; scale: LetterScaleEntry[] }) {
  const [current, setCurrent] = useState("");
  const [weight, setWeight] = useState("20");
  const [target, setTarget] = useState("90");

  const loadCourse = (c: CourseDTO) => {
    const g = courseGrade(c, scale);
    if (g.pct != null) setCurrent(String(g.pct));
  };

  const cur = n(current);
  const w = n(weight);
  const tgt = n(target);
  const hasInput = current !== "" && w > 0;
  const { needed, maxPossible, minPossible } = neededOnFinal(cur, w, tgt);

  const tone =
    needed == null ? "primary" : needed > 100 ? "warning" : needed <= 0 ? "success" : "primary";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CoursePicker courses={courses} onPick={loadCourse} label="Use a course's current grade" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Current grade %">
          <Input inputMode="decimal" placeholder="87" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Labeled>
        <Labeled label="Final worth %">
          <Input inputMode="decimal" placeholder="20" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Labeled>
        <Labeled label="Grade you want %">
          <Input inputMode="decimal" placeholder="90" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Labeled>
      </div>

      {hasInput ? (
        <>
          <div
            className={cn(
              "flex items-baseline gap-3 rounded-xl border p-4",
              tone === "warning"
                ? "border-warning/25 bg-warning/[0.06]"
                : tone === "success"
                  ? "border-success/25 bg-success/[0.06]"
                  : "border-primary/25 bg-primary/[0.06]",
            )}
          >
            <span className="text-3xl font-semibold tracking-tight">
              {needed == null ? "—" : fmtPct(Math.max(0, needed))}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {needed == null
                ? ""
                : needed > 100
                  ? "Not reachable with this final alone"
                  : needed <= 0
                    ? "You've already locked it in"
                    : "needed on the final"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Best case (100% final): {fmtPct(maxPossible)}</Badge>
            <Badge tone="warning">Worst case (0% final): {fmtPct(minPossible)}</Badge>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter your current grade and how much the final is worth.
        </p>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* --------------------------------- GPA --------------------------------- */

interface GRow {
  id: string;
  name: string;
  credits: string;
  letter: string;
}

function GpaCalc({ courses }: { courses: CourseDTO[] }) {
  const seeded = useMemo<GRow[]>(() => {
    if (courses.length === 0) return [{ id: rid(), name: "", credits: "1", letter: "A" }];
    return courses.map((c) => ({
      id: rid(),
      name: c.name,
      credits: "1",
      letter: courseGrade(c).letter ?? "A",
    }));
  }, [courses]);

  const [rows, setRows] = useState<GRow[]>(seeded);

  const set = (id: string, patch: Partial<GRow>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  let qp = 0;
  let cr = 0;
  for (const row of rows) {
    const pts = gpaFromLetter(row.letter);
    const credits = n(row.credits);
    if (pts == null || !(credits > 0)) continue;
    qp += pts * credits;
    cr += credits;
  }
  const gpa = cr > 0 ? Math.round((qp / cr) * 100) / 100 : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Course · credits · letter</p>
        <Button size="sm" variant="ghost" onClick={() => setRows(seeded)}>
          Reset to my courses
        </Button>
      </div>

      {rows.map((row) => (
        <RowShell
          key={row.id}
          onRemove={rows.length > 1 ? () => setRows((r) => r.filter((x) => x.id !== row.id)) : undefined}
        >
          <Input
            className="h-9 flex-1"
            placeholder="Course"
            value={row.name}
            onChange={(e) => set(row.id, { name: e.target.value })}
          />
          <Input
            className="h-9 w-16 text-center"
            inputMode="decimal"
            placeholder="cr"
            value={row.credits}
            onChange={(e) => set(row.id, { credits: e.target.value })}
          />
          <Select
            className="h-9 w-20"
            value={row.letter}
            onChange={(e) => set(row.id, { letter: e.target.value })}
          >
            {GPA_LETTERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </RowShell>
      ))}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setRows((r) => [...r, { id: rid(), name: "", credits: "1", letter: "A" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add course
      </Button>

      <div className="mt-5 flex items-baseline gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
        <span className="text-3xl font-semibold tracking-tight">{gpa == null ? "—" : gpa.toFixed(2)}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {cr > 0 ? `${num(cr)} credits · unweighted 4.0 scale` : "Pick letters and credits"}
        </span>
      </div>
    </div>
  );
}
