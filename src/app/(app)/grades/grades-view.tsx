"use client";

import { useMemo, useState, useEffect } from "react";
import { Percent, GraduationCap, ChevronDown, BookOpen, Calculator } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
  estimateGpa,
  fmtPct,
  gradedWithPoints,
  resolveGradeScale,
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

  const graded = courses
    .map((c) => ({ course: c, grade: courseGrade(c, scale) }))
    .filter((x) => x.grade.pct != null || x.grade.letter);

  const { gpa, counted } = estimateGpa(courses, scale);
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
            <Stat label="Estimated GPA" value={gpa == null ? "—" : gpa.toFixed(2)} sub={`${counted} of ${courses.length} classes · 4.0 scale`} />
            <Stat label="Average grade" value={avg == null ? "—" : fmtPct(avg)} sub={`${graded.length} class${graded.length === 1 ? "" : "es"} with a grade`} />
            <Stat label="Classes tracked" value={courses.length} sub={`${courses.filter((c) => c.provider === "canvas").length} from Canvas`} />
          </div>

          <div className="space-y-4">
            {courses.map((c) => (
              <CourseGradeCard
                key={c.id}
                course={c}
                scale={scale}
                onSetGrade={(v) => updateCourse(c.id, { currentGrade: v })}
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
        <GradeCalculators courses={courses} scale={scale} />
      </Modal>

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
  onSetGrade,
}: {
  course: CourseDTO;
  scale: LetterScaleEntry[];
  onSetGrade: (grade: string | null) => void;
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
