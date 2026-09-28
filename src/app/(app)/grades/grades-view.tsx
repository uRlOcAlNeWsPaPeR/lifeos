"use client";

import { useMemo, useState, useEffect } from "react";
import { Percent, GraduationCap, ChevronDown, BookOpen, Calculator, Scale, Plus, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { CanvasBadge } from "@/components/canvas/canvas-badge";
import { GradeCalculators } from "@/components/app/grade-calculators";
import { GradeScalePicker } from "@/components/app/grade-scale-picker";
import { useAppData } from "@/lib/store/app-data";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assignmentGradeLabel,
  courseGrade,
  DEFAULT_GPA_LEVELS,
  DEFAULT_GPA_POINTS,
  GPA_LETTERS,
  GPA_POINT_PRESETS,
  estimateGpa,
  findGpaLevel,
  gpaFromLetter,
  REGULAR_LEVEL_ID,
  fmtPct,
  gradedWithPoints,
  resolveGradeScale,
  type GpaLevel,
  type GpaPoints,
  type GradeSource,
  type GradeScalePref,
  type LetterScaleEntry,
} from "@/lib/grades";
import type { CourseDTO } from "@/lib/types";

const SOURCE_LABEL: Record<GradeSource, string> = {
  canvas: "From Canvas",
  weighted: "Weighted by category",
  computed: "Calculated from graded work",
  manual: "Entered manually",
};

export function GradesView() {
  const { data, updateCourse, updatePrefs } = useAppData();
  const courses = data.courses;
  const scale = useMemo(
    () => resolveGradeScale(data.profile.prefs.gradeScale),
    [data.profile.prefs.gradeScale],
  );

  // First time this student opens Grades (or any time they haven't chosen a
  // scale yet), nudge them to pick one — different schools draw the letter
  // cutoffs in different places. Re-derived fresh on every mount, so it keeps
  // asking (gently, dismissibly) until they actually pick something.
  const [scalePromptOpen, setScalePromptOpen] = useState(
    () => data.profile.prefs.gradeScale.presetId === null,
  );
  const [calcOpen, setCalcOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);

  const graded = courses
    .map((c) => ({ course: c, grade: courseGrade(c, scale) }))
    .filter((x) => x.grade.pct != null || x.grade.letter);

  const levels = data.profile.prefs.gpaLevels?.length ? data.profile.prefs.gpaLevels : DEFAULT_GPA_LEVELS;
  const weighted = data.profile.prefs.gpaWeighted;
  const points = data.profile.prefs.gpaPoints ?? DEFAULT_GPA_POINTS;
  const { unweighted, weighted: weightedGpa, counted } = estimateGpa(courses, scale, levels, points);
  const gpa = weighted ? weightedGpa : unweighted;
  // Set up = the student saved their own levels or put a class above Regular.
  const weightedSetUp =
    Boolean(data.profile.prefs.gpaLevels?.length) ||
    courses.some((c) => c.gpaLevel && c.gpaLevel !== REGULAR_LEVEL_ID);
  const pcts = graded.map((g) => g.grade.pct).filter((p): p is number => p != null);
  const avg = pcts.length
    ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10
    : null;

  return (
    <>
      <PageHeader
        title="Grades"
        description="Every class in one place. Canvas grades sync in automatically; anything else you can calculate or enter yourself."
        action={
          <Button size="sm" onClick={() => setCalcOpen(true)}>
            <Calculator className="h-3.5 w-3.5" /> Calculators
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Add your classes in School — or connect Canvas — and their grades will show up here."
          action={
            <Link href="/school">
              <Button size="sm">Go to School</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <GpaStat
              gpa={gpa}
              other={weighted ? unweighted : weightedGpa}
              weighted={weighted}
              weightedSetUp={weightedSetUp}
              counted={counted}
              total={courses.length}
              onToggle={(v) => updatePrefs({ gpaWeighted: v })}
              onEditLevels={() => setLevelsOpen(true)}
              onEditPoints={() => setPointsOpen(true)}
            />
            <Stat label="Average grade" value={avg == null ? "—" : fmtPct(avg)} sub={`${graded.length} class${graded.length === 1 ? "" : "es"} with a grade`} />
            <Stat label="Classes tracked" value={courses.length} sub={`${courses.filter((c) => c.provider === "canvas").length} from Canvas`} />
          </div>

          <div className="space-y-4">
            {courses.map((c) => (
              <CourseGradeCard
                key={c.id}
                course={c}
                scale={scale}
                levels={levels}
                points={points}
                weighted={weighted}
                onSetGrade={(v) => updateCourse(c.id, { currentGrade: v })}
                onSetLevel={(id) => updateCourse(c.id, { gpaLevel: id })}
              />
            ))}
          </div>
        </div>
      )}

      <Modal
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        title="Grade calculators"
        className="max-w-2xl"
      >
        <GradeCalculators courses={courses} scale={scale} gpaPoints={points} />
      </Modal>

      <GpaPointsModal
        open={pointsOpen}
        onClose={() => setPointsOpen(false)}
        value={points}
        onSave={(gpaPoints) => updatePrefs({ gpaPoints })}
      />

      <GpaLevelsModal
        open={levelsOpen}
        onClose={() => setLevelsOpen(false)}
        value={levels}
        onSave={(gpaLevels) => updatePrefs({ gpaLevels })}
      />

      <GradeScalePromptModal
        open={scalePromptOpen}
        onClose={() => setScalePromptOpen(false)}
        value={data.profile.prefs.gradeScale}
        onSave={(gradeScale) => updatePrefs({ gradeScale })}
      />
    </>
  );
}

function GradeScalePromptModal({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: GradeScalePref;
  onSave: (v: GradeScalePref) => void;
}) {
  const [draft, setDraft] = useState<GradeScalePref>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose your grading scale"
      description="Schools (and countries) draw the letter-grade cutoffs in different places — pick whichever matches yours. Change it anytime in Settings → School."
    >
      <GradeScalePicker value={draft} onChange={setDraft} />
      <div className="mt-4 flex justify-end">
        <Button
          disabled={draft.presetId === null}
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}

/**
 * GPA with the weighted/unweighted switch on it. Both numbers are always
 * computed, so the one you aren't showing sits underneath as a reference
 * rather than making the student toggle back and forth to compare.
 */
function GpaStat({
  gpa,
  other,
  weighted,
  weightedSetUp,
  counted,
  total,
  onToggle,
  onEditLevels,
  onEditPoints,
}: {
  gpa: number | null;
  other: number | null;
  weighted: boolean;
  weightedSetUp: boolean;
  counted: number;
  total: number;
  onToggle: (weighted: boolean) => void;
  onEditLevels: () => void;
  onEditPoints: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {weighted ? "Weighted GPA" : "Unweighted GPA"}
        </span>
        <div className="flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="GPA type">
          {[
            { on: false, label: "4.0" },
            { on: true, label: "Weighted" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={weighted === opt.on}
              onClick={() => onToggle(opt.on)}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                weighted === opt.on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{gpa == null ? "—" : gpa.toFixed(2)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {counted} of {total} class{total === 1 ? "" : "es"}
        {other != null && ` · ${weighted ? "4.0 scale" : "weighted"} ${other.toFixed(2)}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={onEditPoints}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Scale className="h-3.5 w-3.5" />
          Unweighted GPA settings
        </button>
        <button
          type="button"
          onClick={onEditLevels}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Scale className="h-3.5 w-3.5" />
          {weightedSetUp ? "Weighted GPA settings" : "Set up weighted GPA"}
        </button>
      </div>
    </Card>
  );
}

/**
 * How many GPA points each letter is worth. The usual 4.0 scale isn't
 * universal — some schools ignore +/-, some give an A+ 4.3 — so the student
 * picks a preset or types their own. Weighted GPA builds on the same points.
 */
function GpaPointsModal({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: GpaPoints;
  onSave: (points: GpaPoints) => void;
}) {
  const [rows, setRows] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setRows(Object.fromEntries(GPA_LETTERS.map((l) => [l, String(value[l] ?? DEFAULT_GPA_POINTS[l])])));
  }, [open, value]);

  const matching = GPA_POINT_PRESETS.find((p) =>
    GPA_LETTERS.every((l) => Number(rows[l]) === p.points[l]),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: GpaPoints = {};
    for (const l of GPA_LETTERS) {
      const n = Number(rows[l]);
      // A blank or nonsense cell keeps the standard value rather than saving NaN.
      next[l] = Number.isFinite(n) && rows[l]?.trim() !== "" && n >= 0 && n <= 10 ? n : DEFAULT_GPA_POINTS[l];
    }
    onSave(next);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unweighted GPA settings"
      description="How many points each letter grade is worth at your school."
    >
      <form onSubmit={submit} className="space-y-4">
        <Select
          value={matching?.id ?? "custom"}
          onChange={(e) => {
            const preset = GPA_POINT_PRESETS.find((p) => p.id === e.target.value);
            if (preset) setRows(Object.fromEntries(GPA_LETTERS.map((l) => [l, String(preset.points[l])])));
          }}
          aria-label="Scale preset"
        >
          {GPA_POINT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.note}
            </option>
          ))}
          {!matching && <option value="custom">Custom (your edits)</option>}
        </Select>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {GPA_LETTERS.map((l) => (
            <label key={l} className="flex items-center justify-between gap-2">
              <span className="w-8 text-sm font-medium">{l}</span>
              <Input
                inputMode="decimal"
                value={rows[l] ?? ""}
                onChange={(e) => setRows((cur) => ({ ...cur, [l]: e.target.value }))}
                aria-label={`Points for ${l}`}
                className="h-9 w-20 text-right"
              />
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Your letter cutoffs (which percent is an A) are set separately in Settings → School. Weighted GPA
          adds each class&apos;s level bonus to these points.
        </p>

        <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

interface LevelDraft {
  id: string;
  name: string;
  bonus: string;
}

/**
 * Schools weight GPA differently — most add a point for AP and half for
 * honors, but plenty don't — so the levels themselves are the student's to
 * define. Ids are kept stable across edits so renaming a level doesn't
 * detach the classes already tagged with it.
 */
function GpaLevelsModal({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: GpaLevel[];
  onSave: (levels: GpaLevel[]) => void;
}) {
  const [rows, setRows] = useState<LevelDraft[]>([]);

  useEffect(() => {
    if (open) setRows(value.map((l) => ({ id: l.id, name: l.name, bonus: String(l.bonus) })));
  }, [open, value]);

  function patch(i: number, p: Partial<LevelDraft>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = rows
      .map((r) => ({ id: r.id, name: r.name.trim(), bonus: Number(r.bonus) }))
      .filter((r) => r.name && Number.isFinite(r.bonus) && r.bonus >= 0 && r.bonus <= 3);
    if (clean.length) onSave(clean);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Weighted GPA levels"
      description="What each kind of class adds on top of the 4.0 scale at your school."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                value={r.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                placeholder="Level name"
                aria-label="Level name"
                className="h-9 flex-1"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">+</span>
                <Input
                  inputMode="decimal"
                  value={r.bonus}
                  onChange={(e) => patch(i, { bonus: e.target.value })}
                  aria-label={`Bonus for ${r.name || "level"}`}
                  className="h-9 w-16 text-right"
                />
              </div>
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                A = {(4 + (Number(r.bonus) || 0)).toFixed(1)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label={`Remove ${r.name || "level"}`}
                disabled={r.id === REGULAR_LEVEL_ID}
                title={r.id === REGULAR_LEVEL_ID ? "Every school has regular classes" : undefined}
                onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((cur) => [...cur, { id: `level-${Date.now().toString(36)}`, name: "", bonus: "0.5" }])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add a level
        </Button>

        <p className="text-xs text-muted-foreground">
          Tag each class with its level on the cards below. A failing grade never earns the bonus.
        </p>

        <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save levels</Button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
          <Percent className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function CourseGradeCard({
  course,
  scale,
  levels,
  points,
  weighted,
  onSetGrade,
  onSetLevel,
}: {
  course: CourseDTO;
  scale: LetterScaleEntry[];
  levels: GpaLevel[];
  points: GpaPoints;
  weighted: boolean;
  onSetGrade: (grade: string | null) => void;
  onSetLevel: (levelId: string | null) => void;
}) {
  const g = courseGrade(course, scale);
  const graded = gradedWithPoints(course);
  const [open, setOpen] = useState(false);
  const hasGrade = g.pct != null || g.letter;
  // A manually-added course with no Canvas grade and no graded assignments —
  // let the student just type the grade in so it still counts toward GPA.
  const canType = course.provider !== "canvas" && (g.source === null || g.source === "manual");

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: course.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{course.name}</p>
            {course.code && <Badge tone="muted">{course.code}</Badge>}
            {course.provider === "canvas" && <CanvasBadge />}
          </div>
          {g.source && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {SOURCE_LABEL[g.source]}
              {g.source === "computed" && ` · ${g.gradedCount} assignment${g.gradedCount === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {hasGrade ? (
            <>
              <p className="text-2xl font-semibold leading-none tracking-tight">
                {g.letter ?? fmtPct(g.pct)}
              </p>
              {g.letter && g.pct != null && (
                <p className="text-xs text-muted-foreground">{fmtPct(g.pct)}</p>
              )}
            </>
          ) : (
            !canType && <p className="text-sm text-muted-foreground">No grade yet</p>
          )}
          {canType && (
            <ManualGradeField
              value={course.currentGrade ?? ""}
              onSave={(v) => onSetGrade(v || null)}
            />
          )}
        </div>
      </div>

      {g.pct != null && (
        <Progress
          className="mt-4"
          value={g.pct}
          tone={g.pct >= 90 ? "success" : g.pct >= 70 ? "primary" : "warning"}
        />
      )}

      {levels.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Counts as</span>
          <Select
            value={course.gpaLevel ?? REGULAR_LEVEL_ID}
            onChange={(e) =>
              onSetLevel(e.target.value === REGULAR_LEVEL_ID ? null : e.target.value)
            }
            aria-label={`GPA level for ${course.name}`}
            className="h-8 w-auto py-0 text-xs"
          >
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.bonus > 0 ? ` (+${l.bonus})` : ""}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">
            {weighted
              ? `A = ${((gpaFromLetter("A", points) ?? 4) + (findGpaLevel(levels, course.gpaLevel)?.bonus ?? 0)).toFixed(1)}`
              : "for weighted GPA"}
          </span>
        </div>
      )}

      {graded.length > 0 && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            {open ? "Hide" : "Show"} {graded.length} graded assignment{graded.length === 1 ? "" : "s"}
          </button>

          {open && (
            <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06] animate-slide-up">
              {graded.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  {a.dueAt && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(a.dueAt, { month: "short", day: "numeric" })}
                    </span>
                  )}
                  <span className="shrink-0 font-medium">{assignmentGradeLabel(a)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function ManualGradeField({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Input
      className="h-8 w-24 text-center text-sm"
      placeholder="A- / 91%"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value.trim() && onSave(draft.trim())}
      aria-label="Course grade"
    />
  );
}
