"use client";

import { useState } from "react";
import { Percent, GraduationCap, ChevronDown, BookOpen } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { CanvasBadge } from "@/components/canvas/canvas-badge";
import { GradeCalculators } from "@/components/app/grade-calculators";
import { useAppData } from "@/lib/store/app-data";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assignmentGradeLabel,
  courseGrade,
  estimateGpa,
  fmtPct,
  gradedWithPoints,
  type GradeSource,
} from "@/lib/grades";
import type { CourseDTO } from "@/lib/types";

const SOURCE_LABEL: Record<GradeSource, string> = {
  canvas: "From Canvas",
  computed: "Calculated from graded work",
  manual: "Entered manually",
};

export function GradesView() {
  const { data, updateCourse } = useAppData();
  const courses = data.courses;

  const graded = courses
    .map((c) => ({ course: c, grade: courseGrade(c) }))
    .filter((x) => x.grade.pct != null || x.grade.letter);

  const { gpa, counted } = estimateGpa(courses);
  const pcts = graded.map((g) => g.grade.pct).filter((p): p is number => p != null);
  const avg = pcts.length
    ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10
    : null;

  return (
    <>
      <PageHeader
        title="Grades"
        description="Every class in one place. Canvas grades sync in automatically; anything else you can calculate or enter yourself."
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
                onSetGrade={(v) => updateCourse(c.id, { currentGrade: v })}
              />
            ))}
          </div>

          <div>
            <div className="divider-gradient mb-6" />
            <GradeCalculators courses={courses} />
          </div>
        </div>
      )}
    </>
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
  onSetGrade,
}: {
  course: CourseDTO;
  onSetGrade: (grade: string | null) => void;
}) {
  const g = courseGrade(course);
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
