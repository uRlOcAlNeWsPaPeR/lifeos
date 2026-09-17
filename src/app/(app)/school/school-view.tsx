"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  GraduationCap,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Folder,
  ListPlus,
  CheckCircle2,
  Plug,
  Camera,
  X,
  AlertCircle,
  Lock,
  Scale,
  ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { confirm } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/input";
import { BrainDumpLoader } from "@/components/app/brain-dump-loader";
import { useAppData } from "@/lib/store/app-data";
import { relativeDue, fmtDate, timeAgo, courseNameWithTeacher, lastName, toInputDate } from "@/lib/format";
import {
  assignmentGradeLabel,
  categoryPct,
  courseGrade,
  fmtPct,
  resolveGradeScale,
  type LetterScaleEntry,
} from "@/lib/grades";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image";
import { authedApi } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import { CanvasBadge, OpenInCanvas } from "@/components/canvas/canvas-badge";
import { AssignmentDetail } from "@/components/app/assignment-detail";
import type { AssignmentDTO, CourseDTO } from "@/lib/types";

const COURSE_COLORS = ["#22d67e", "#14c9b8", "#4f7dff", "#a855f7", "#ec4899", "#f59e0b", "#ef4444"];

/** Grade categories, heaviest first — how they read everywhere they're listed. */
function byWeightDesc<T extends { weight: number }>(weights: T[]): T[] {
  return [...weights].sort((a, b) => b.weight - a.weight);
}

const SOURCE_NOTE: Record<"canvas" | "weighted" | "computed" | "manual", string> = {
  canvas: "synced from Canvas",
  weighted: "weighted by category",
  computed: "calculated from graded assignments",
  manual: "you entered",
};

export function SchoolView() {
  const {
    data,
    addCourse,
    deleteCourse,
    updateCourse,
    addAssignment,
    addAssignmentsBatch,
    updateAssignment,
    deleteAssignment,
    noteScreenshotImportUsed,
  } = useAppData();
  const [courseModal, setCourseModal] = useState(false);
  const [assignFor, setAssignFor] = useState<CourseDTO | null>(null);
  const [screenshotFor, setScreenshotFor] = useState<CourseDTO | null>(null);
  const [weightsFor, setWeightsFor] = useState<CourseDTO | null>(null);
  const [detailFor, setDetailFor] = useState<AssignmentDTO | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const courses = data.courses;
  const scale = useMemo(
    () => resolveGradeScale(data.profile.prefs.gradeScale),
    [data.profile.prefs.gradeScale],
  );
  const openCourse = openId ? courses.find((c) => c.id === openId) ?? null : null;
  // keep the open detail modal in sync with live store updates
  const detailAssignment = detailFor
    ? data.assignments.find((a) => a.id === detailFor.id) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="School"
        description="Track courses, assignments and grades — add them yourself or connect Canvas to import them automatically."
        action={
          <>
            <Link href="/settings?tab=connections">
              <Button variant="outline">
                <Plug className="h-4 w-4" /> Connections
              </Button>
            </Link>
            <Button onClick={() => setCourseModal(true)}>
              <Plus className="h-4 w-4" /> Add course
            </Button>
          </>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Add your classes to start tracking assignments, due dates and grades."
          action={
            <Button size="sm" onClick={() => setCourseModal(true)}>
              <Plus className="h-4 w-4" /> Add course
            </Button>
          }
        />
      ) : openCourse ? (
        <div className="animate-fade-in">
          <button
            onClick={() => setOpenId(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> All courses
          </button>
          <CourseCard
            course={openCourse}
            scale={scale}
            deleteCourse={async (id) => {
              await deleteCourse(id);
              setOpenId(null);
            }}
            updateAssignment={updateAssignment}
            deleteAssignment={deleteAssignment}
            onOpenAssignment={setDetailFor}
            onAddAssignment={() => setAssignFor(openCourse)}
            onImportScreenshot={() => setScreenshotFor(openCourse)}
            onEditWeights={() => setWeightsFor(openCourse)}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseFolder key={c.id} course={c} scale={scale} onOpen={() => setOpenId(c.id)} />
          ))}
        </div>
      )}

      <CourseEditor open={courseModal} onClose={() => setCourseModal(false)} onCreate={addCourse} />
      <AssignmentEditor course={assignFor} onClose={() => setAssignFor(null)} onCreate={addAssignment} />
      <GradeWeightsEditor
        course={weightsFor}
        onClose={() => setWeightsFor(null)}
        onSave={(courseId, rows) => updateCourse(courseId, { gradeWeights: rows.length ? rows : null })}
      />
      <AssignmentScreenshotImporter
        course={screenshotFor}
        onClose={() => setScreenshotFor(null)}
        onImport={addAssignmentsBatch}
        onUsed={noteScreenshotImportUsed}
        enabled={data.limits.screenshotImportEnabled}
        atLimit={
          data.limits.screenshotImportsPerWeek !== null &&
          data.limits.screenshotImportsUsedThisWeek >= data.limits.screenshotImportsPerWeek
        }
        weeklyLimit={data.limits.screenshotImportsPerWeek}
      />
      <AssignmentDetail assignment={detailAssignment} onClose={() => setDetailFor(null)} />
    </>
  );
}

/** A closed folder in the School grid. Click it to open the course. */
function CourseFolder({
  course,
  scale,
  onOpen,
}: {
  course: CourseDTO;
  scale: LetterScaleEntry[];
  onOpen: () => void;
}) {
  const g = courseGrade(course, scale);
  const openCount = course.assignments.filter((a) => a.status === "open").length;
  const grade = g.letter ?? (g.pct != null ? fmtPct(g.pct) : null);

  return (
    <button onClick={onOpen} className="group relative block w-full pt-2.5 text-left">
      {/* folder tab */}
      <span
        className="absolute left-5 top-0 h-3 w-16 rounded-t-lg"
        style={{ background: course.color }}
      />
      <div
        className="relative flex min-h-[7rem] flex-col rounded-2xl rounded-tl-md border p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-glow-sm"
        style={{
          borderColor: `${course.color}44`,
          background: `linear-gradient(155deg, ${course.color}18, transparent 65%)`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <Folder className="h-5 w-5 shrink-0" style={{ color: course.color }} />
          <div className="flex items-center gap-1.5">
            {course.provider === "canvas" && <CanvasBadge />}
            {grade && <span className="text-sm font-semibold">{grade}</span>}
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{course.name}</p>
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          {openCount > 0
            ? `${openCount} open assignment${openCount === 1 ? "" : "s"}`
            : "Nothing open"}
        </p>
      </div>
    </button>
  );
}

function CourseCard({
  course,
  scale,
  deleteCourse,
  updateAssignment,
  deleteAssignment,
  onOpenAssignment,
  onAddAssignment,
  onImportScreenshot,
  onEditWeights,
}: {
  course: CourseDTO;
  scale: LetterScaleEntry[];
  deleteCourse: (id: string) => Promise<void>;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  onOpenAssignment: (a: AssignmentDTO) => void;
  onAddAssignment: () => void;
  onImportScreenshot: () => void;
  onEditWeights: () => void;
}) {
  // Default view is just what's still actionable: upcoming work and anything
  // turned in but not yet graded. Two things get tucked away — still there,
  // still deletable, just out of the everyday list:
  //   • open assignments already past their due date  → "N overdue"
  //   • graded assignments (the grade record)         → "N graded"
  const isPastDue = (a: AssignmentDTO) =>
    a.status === "open" && Boolean(relativeDue(a.dueAt)?.past);
  const isGraded = (a: AssignmentDTO) => a.status === "graded";

  const [showOverdue, setShowOverdue] = useState(false);
  const [showGraded, setShowGraded] = useState(false);

  const visible = course.assignments.filter((a) => {
    if (isGraded(a)) return showGraded;
    if (isPastDue(a)) return showOverdue;
    return true;
  });
  const overdueCount = course.assignments.filter(isPastDue).length;
  const gradedCount = course.assignments.filter(isGraded).length;
  const openCount = visible.filter((a) => a.status === "open").length;

  // Once grade weights exist, split the list into a section per category —
  // "Tests 50%", "Homework 20%" — each with its own running average, instead
  // of a flat list with a per-row category picker as the only sign of it.
  // Canvas courses get here too when the teacher turns on weighted grading —
  // Canvas syncs its own categories in automatically (see canvas/sync.ts).
  const categorized = Boolean(course.gradeWeights?.length);
  const groups = categorized
    ? (() => {
        const weights = byWeightDesc(course.gradeWeights!);
        const known = new Set(weights.map((w) => w.category));
        const defined = weights.map((w) => ({
          key: w.category,
          label: w.category,
          weight: w.weight as number | null,
          items: visible.filter((a) => (a.category ?? "") === w.category),
          avgPct: categoryPct(course.assignments.filter((a) => (a.category ?? "") === w.category)),
        }));
        const uncategorized = {
          key: "",
          label: "No category",
          weight: null as number | null,
          items: visible.filter((a) => !known.has(a.category ?? "")),
          avgPct: null as number | null,
        };
        // Every declared weight category always gets its section, in weight
        // order, even with nothing in it yet — that's the whole point of
        // seeing the breakdown. "No category" is the exception: it's not a
        // real category, so it only shows up once something actually lands there.
        return uncategorized.items.length > 0 ? [...defined, uncategorized] : defined;
      })()
    : null;

  const [open, setOpen] = useState(true);
  const g = courseGrade(course, scale);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDueAt, setBulkDueAt] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBulkDueAt("");
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    const yes = await confirm({
      title: `Delete ${ids.length} assignment${ids.length === 1 ? "" : "s"}?`,
      body: "This can't be undone from here.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!yes) return;
    setBulkBusy(true);
    await Promise.all(ids.map((id) => deleteAssignment(id)));
    setBulkBusy(false);
    exitSelectMode();
  }

  async function bulkSetCategory(category: string) {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    await Promise.all(ids.map((id) => updateAssignment(id, { category: category || null })));
    setBulkBusy(false);
  }

  async function bulkSetDueAt(dueAt: string) {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    await Promise.all(ids.map((id) => updateAssignment(id, { dueAt: dueAt || null })));
    setBulkBusy(false);
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: course.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{course.name}</p>
            {course.code && <Badge tone="muted">{course.code}</Badge>}
            {course.provider === "canvas" ? (
              <CanvasBadge />
            ) : course.provider ? (
              <Badge tone="primary">{course.provider}</Badge>
            ) : null}
          </div>
          {course.instructor && (
            <p className="mt-1 text-xs text-muted-foreground">{course.instructor}</p>
          )}
        </div>
        <div className="flex items-start gap-3">
          {(g.pct != null || g.letter) && (
            <div className="text-right leading-tight" title={`Grade ${SOURCE_NOTE[g.source ?? "manual"]}`}>
              <p className="text-lg font-semibold">{g.letter ?? fmtPct(g.pct)}</p>
              {g.letter && g.pct != null && (
                <p className="text-[11px] text-muted-foreground">{fmtPct(g.pct)}</p>
              )}
            </div>
          )}
          <button
            onClick={async () => {
              const yes = await confirm({
                title: `Delete ${course.name}?`,
                body: "Its assignments go too. You can undo right after from the bar at the bottom.",
                confirmLabel: "Delete course",
                destructive: true,
              });
              if (yes) deleteCourse(course.id);
            }}
            className="mt-0.5 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Delete course"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs font-medium text-primary"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          {visible.length} assignment{visible.length === 1 ? "" : "s"}
          {openCount > 0 && ` · ${openCount} open`}
        </button>
        {overdueCount > 0 && (
          <button
            onClick={() => {
              setShowOverdue((s) => !s);
              setOpen(true);
            }}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showOverdue ? "Hide overdue" : `${overdueCount} overdue`}
          </button>
        )}
        {gradedCount > 0 && (
          <button
            onClick={() => {
              setShowGraded((s) => !s);
              setOpen(true);
            }}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showGraded ? "Hide graded" : `${gradedCount} graded`}
          </button>
        )}
        <Button size="sm" variant="ghost" onClick={onAddAssignment}>
          <Plus className="h-3.5 w-3.5" /> Assignment
        </Button>
        <Button size="sm" variant="ghost" onClick={onImportScreenshot}>
          <Camera className="h-3.5 w-3.5" /> Screenshot
        </Button>
        <Button size="sm" variant="ghost" onClick={onEditWeights}>
          <Scale className="h-3.5 w-3.5" /> Weights
        </Button>
        {visible.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            <ListChecks className="h-3.5 w-3.5" /> {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 animate-fade-in">
          <span className="px-1 text-xs font-medium">{selected.size} selected</span>
          {course.gradeWeights && course.gradeWeights.length > 0 && (
            <Select
              className="h-8 w-36 text-xs"
              defaultValue=""
              disabled={bulkBusy}
              onChange={(e) => bulkSetCategory(e.target.value)}
              aria-label="Set category for selected"
            >
              <option value="" disabled>
                Set category…
              </option>
              <option value="">No category</option>
              {byWeightDesc(course.gradeWeights).map((w) => (
                <option key={w.category} value={w.category}>
                  {w.category}
                </option>
              ))}
            </Select>
          )}
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={bulkDueAt}
            disabled={bulkBusy}
            onChange={(e) => {
              setBulkDueAt(e.target.value);
              if (e.target.value) bulkSetDueAt(e.target.value);
            }}
            aria-label="Set due date for selected"
          />
          <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={bulkBusy}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={exitSelectMode} disabled={bulkBusy}>
            Done
          </Button>
        </div>
      )}

      {open && visible.length > 0 && (
        categorized ? (
          <div className="mt-3 space-y-5 animate-slide-up">
            {groups!.map((grp) => (
              <div key={grp.key || "__none__"}>
                <div className="mb-1 flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <span className="text-xs font-semibold">
                    {grp.label}
                    {grp.weight != null && (
                      <span className="ml-1.5 font-normal text-muted-foreground">{grp.weight}%</span>
                    )}
                  </span>
                  {grp.avgPct != null && (
                    <span className="text-xs text-muted-foreground">{fmtPct(grp.avgPct)} avg</span>
                  )}
                </div>
                <ul className="divide-y divide-white/[0.06]">
                  {grp.items.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      a={a}
                      course={course}
                      selectMode={selectMode}
                      selected={selected.has(a.id)}
                      onToggleSelect={() => toggleSelect(a.id)}
                      onOpen={() => onOpenAssignment(a)}
                      updateAssignment={updateAssignment}
                      deleteAssignment={deleteAssignment}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06] animate-slide-up">
            {visible.map((a) => (
              <AssignmentRow
                key={a.id}
                a={a}
                course={course}
                selectMode={selectMode}
                selected={selected.has(a.id)}
                onToggleSelect={() => toggleSelect(a.id)}
                onOpen={() => onOpenAssignment(a)}
                updateAssignment={updateAssignment}
                deleteAssignment={deleteAssignment}
              />
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

/**
 * One assignment row — used both in the flat list and inside a category
 * section once the course has grade weights defined.
 */
function AssignmentRow({
  a,
  course,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  updateAssignment,
  deleteAssignment,
}: {
  a: AssignmentDTO;
  course: CourseDTO;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
}) {
  const due = relativeDue(a.dueAt);
  const past = a.status === "open" && Boolean(due?.past);
  const upcoming = a.status === "open" && !!due && !due.past;

  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-3", past && "opacity-60")}>
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-4 w-4 shrink-0 accent-primary"
          aria-label={`Select ${a.title}`}
        />
      )}
      <button
        onClick={() => (selectMode ? onToggleSelect() : onOpen())}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-1.5 truncate text-sm",
              upcoming && "font-semibold",
              a.status === "graded" && "text-muted-foreground",
            )}
          >
            <span className="truncate">{a.title}</span>
            {a.provider === "canvas" && <CanvasBadge className="shrink-0" />}
            {a.status === "open" && a.localDone && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Marked done" />
            )}
            {a.linkedTask && (
              <ListPlus
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  a.linkedTask.status === "done" ? "text-primary" : "text-muted-foreground",
                )}
                aria-label="Has a plan"
              />
            )}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {a.dueAt ? fmtDate(a.dueAt, { weekday: "short", month: "short", day: "numeric" }) : "No due date"}
              {a.status === "graded" && assignmentGradeLabel(a) ? (
                <span className="ml-1 font-medium text-foreground">· {assignmentGradeLabel(a)}</span>
              ) : null}
            </span>
            <OpenInCanvas url={a.canvasUrl} compact />
          </p>
        </div>
      </button>
      {a.status === "open" && a.localDone ? (
        <Badge tone="success">Done</Badge>
      ) : (
        due && a.status !== "graded" && <Badge tone={due.tone}>{due.label}</Badge>
      )}
      {!selectMode && (
        <>
          {course.gradeWeights && course.gradeWeights.length > 0 && (
            <Select
              className="h-8 w-28 text-xs"
              value={a.category ?? ""}
              onChange={(e) => updateAssignment(a.id, { category: e.target.value || null })}
              aria-label="Grade category"
            >
              <option value="">No category</option>
              {byWeightDesc(course.gradeWeights).map((w) => (
                <option key={w.category} value={w.category}>
                  {w.category}
                </option>
              ))}
            </Select>
          )}
          <Select
            className="h-8 w-28 text-xs"
            value={a.status}
            onChange={(e) => updateAssignment(a.id, { status: e.target.value })}
          >
            <option value="open">Open</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
          </Select>
          {a.status === "graded" && (
            <GradeEntry assignment={a} onSave={(patch) => updateAssignment(a.id, patch)} />
          )}
          <button
            onClick={() => deleteAssignment(a.id)}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Delete assignment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  );
}

function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Inline grade entry on a graded assignment row.
 *  Manual assignments take points (earned / possible); Canvas owns its own. */
function GradeEntry({
  assignment,
  onSave,
}: {
  assignment: AssignmentDTO;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [earned, setEarned] = useState(assignment.pointsEarned?.toString() ?? "");
  const [possible, setPossible] = useState(assignment.pointsPossible?.toString() ?? "");
  const [gradeValue, setGradeValue] = useState(assignment.gradeValue ?? "");

  if (assignment.provider === "canvas") {
    return (
      <span className="w-20 text-center text-xs font-medium text-muted-foreground">
        {assignmentGradeLabel(assignment) ?? "—"}
      </span>
    );
  }

  const commitPoints = () => {
    const e = parseNum(earned);
    const p = parseNum(possible);
    if (e === (assignment.pointsEarned ?? null) && p === (assignment.pointsPossible ?? null)) return;
    onSave({ pointsEarned: e, pointsPossible: p });
  };

  const commitGradeValue = () => {
    const v = gradeValue.trim() || null;
    if (v === (assignment.gradeValue ?? null)) return;
    onSave({ gradeValue: v });
  };

  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-1">
        <Input
          className="h-8 w-12 text-center text-xs"
          inputMode="decimal"
          placeholder="got"
          value={earned}
          onChange={(e) => setEarned(e.target.value)}
          onBlur={commitPoints}
          aria-label="Points earned"
        />
        <span className="text-xs text-muted-foreground">/</span>
        <Input
          className="h-8 w-12 text-center text-xs"
          inputMode="decimal"
          placeholder="of"
          value={possible}
          onChange={(e) => setPossible(e.target.value)}
          onBlur={commitPoints}
          aria-label="Points possible"
        />
      </span>
      <span className="text-xs text-muted-foreground">or</span>
      <Input
        className="h-8 w-16 text-center text-xs"
        placeholder="A-, 95%"
        value={gradeValue}
        onChange={(e) => setGradeValue(e.target.value)}
        onBlur={commitGradeValue}
        aria-label="Grade (typed in directly)"
      />
    </span>
  );
}

function CourseEditor({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<CourseDTO | undefined>;
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    instructor: "",
    color: COURSE_COLORS[0],
    currentGrade: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const instructor = form.instructor.trim();
    const res = await onCreate({
      ...form,
      // "AP Physics" + "Ms. York" → "AP Physics - York"
      name: courseNameWithTeacher(form.name, instructor),
      instructor: instructor || null,
    });
    setSaving(false);
    if (res) {
      onClose();
      setForm({ name: "", code: "", instructor: "", color: COURSE_COLORS[0], currentGrade: "" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add course">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Course name">
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="AP Physics 1"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code (optional)">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PHYS-101" />
          </Field>
          <Field
            label="Instructor (optional)"
            hint={
              lastName(form.instructor)
                ? `Saved as “${courseNameWithTeacher(form.name || "Course", form.instructor)}”`
                : "Their last name gets added to the course name"
            }
          >
            <Input
              value={form.instructor}
              onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              placeholder="Ms. York"
            />
          </Field>
        </div>
        <Field label="Current grade (optional)">
          <Input
            value={form.currentGrade}
            onChange={(e) => setForm({ ...form, currentGrade: e.target.value })}
            placeholder="A- / 91%"
          />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium">Color</p>
          <div className="flex gap-2">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                  form.color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add course
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentEditor({
  course,
  onClose,
  onCreate,
}: {
  course: CourseDTO | null;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<AssignmentDTO | undefined>;
}) {
  const [form, setForm] = useState({ title: "", dueAt: "", description: "", pointsPossible: "", category: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) setForm({ title: "", dueAt: "", description: "", pointsPossible: "", category: "" });
  }, [course]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!course || !form.title.trim()) return;
    setSaving(true);
    const res = await onCreate({
      title: form.title.trim(),
      dueAt: form.dueAt || null,
      description: form.description.trim() || null,
      courseId: course.id,
      pointsPossible: parseNum(form.pointsPossible),
      category: form.category || null,
    });
    setSaving(false);
    if (res) {
      onClose();
      setForm({ title: "", dueAt: "", description: "", pointsPossible: "", category: "" });
    }
  }

  return (
    <Modal
      open={!!course}
      onClose={onClose}
      title={course ? `New assignment · ${course.name}` : "New assignment"}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Lab report 3"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date (optional)">
            <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </Field>
          <Field label="Points possible (optional)" hint="Used to calculate your course grade">
            <Input
              inputMode="decimal"
              placeholder="20"
              value={form.pointsPossible}
              onChange={(e) => setForm({ ...form, pointsPossible: e.target.value })}
            />
          </Field>
        </div>
        {course?.gradeWeights && course.gradeWeights.length > 0 && (
          <Field label="Grade category (optional)">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">No category</option>
              {byWeightDesc(course.gradeWeights).map((w) => (
                <option key={w.category} value={w.category}>
                  {w.category} ({w.weight}%)
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes (optional)">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add assignment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface WeightDraft {
  category: string;
  weight: string;
}

/**
 * Category weights for a manually-tracked (non-Canvas) course — e.g. Tests
 * 50%, Homework 20%, Quizzes 30%. Tag each assignment with a category (on the
 * assignment row, or when adding it) and LifeOS averages each category and
 * combines them by weight instead of a flat points total.
 */
function GradeWeightsEditor({
  course,
  onClose,
  onSave,
}: {
  course: CourseDTO | null;
  onClose: () => void;
  onSave: (courseId: string, rows: { category: string; weight: number }[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<WeightDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) {
      setRows(
        course.gradeWeights?.length
          ? byWeightDesc(course.gradeWeights).map((w) => ({ category: w.category, weight: String(w.weight) }))
          : [{ category: "", weight: "" }],
      );
    }
  }, [course]);

  function patchRow(i: number, p: Partial<WeightDraft>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  const totalWeight = rows.reduce((n, r) => n + (parseNum(r.weight) ?? 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!course) return;
    const clean = rows
      .map((r) => ({ category: r.category.trim(), weight: parseNum(r.weight) ?? 0 }))
      .filter((r) => r.category && r.weight > 0);
    setSaving(true);
    await onSave(course.id, clean);
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={!!course} onClose={onClose} title={course ? `Grade weights · ${course.name}` : "Grade weights"}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Split the grade into categories — Tests 50%, Homework 20%, Quizzes 30% — then tag each
          assignment with one. LifeOS averages each category and combines them by weight. Leave this
          empty to just average all your graded assignments&apos; points instead.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Category (e.g. Tests)"
                value={r.category}
                onChange={(e) => patchRow(i, { category: e.target.value })}
              />
              <Input
                className="w-20"
                inputMode="decimal"
                placeholder="%"
                value={r.weight}
                onChange={(e) => patchRow(i, { weight: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Remove category"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRows((cur) => [...cur, { category: "", weight: "" }])}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add category
          </button>
          <span className={cn("text-xs", totalWeight === 100 ? "text-muted-foreground" : "text-warning")}>
            {totalWeight}% total{totalWeight !== 100 ? " (should add up to 100%)" : ""}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save weights
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface ScreenshotDraft {
  title: string;
  dueAt: string;
  notes: string;
  pointsPossible: string;
  keep: boolean;
}

interface ScreenshotAiItem {
  title: string;
  notes: string | null;
  suggestedDueAt: string | null;
}

/**
 * Point this at a course, snap (or upload) a photo of its assignment list —
 * a Canvas page, a printed syllabus, a planner — and LifeOS reads every item
 * off it into the same review-then-commit flow as adding one by hand.
 */
function AssignmentScreenshotImporter({
  course,
  onClose,
  onImport,
  onUsed,
  enabled,
  atLimit,
  weeklyLimit,
}: {
  course: CourseDTO | null;
  onClose: () => void;
  onImport: (
    courseId: string,
    items: { title: string; dueAt: string | null; description: string | null; pointsPossible: number | null }[],
  ) => Promise<number>;
  onUsed: () => void;
  enabled: boolean;
  atLimit: boolean;
  weeklyLimit: number | null;
}) {
  const [phase, setPhase] = useState<"pick" | "loading" | "review">("pick");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScreenshotDraft[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  function reset() {
    setPhase("pick");
    setError(null);
    setItems([]);
    setImporting(false);
  }

  function close() {
    reset();
    onClose();
  }

  function patch(i: number, p: Partial<ScreenshotDraft>) {
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !course || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase("loading");
    try {
      const { data: image, mimeType } = await compressImage(file);
      const res = await authedApi<{ items: ScreenshotAiItem[] }>("/api/brain-dump/image", {
        method: "POST",
        body: { image, mimeType },
      });
      // Counts against the daily quota either way — it was a real, billed AI
      // call regardless of what it found.
      onUsed();
      if (!res.items?.length) {
        setPhase("pick");
        setError(
          "That doesn't look like a valid screenshot of assignments — no titles or due dates found. Try a clearer photo that shows a Canvas page, syllabus, or planner.",
        );
        return;
      }
      setItems(
        res.items.map((it) => ({
          title: it.title,
          dueAt: toInputDate(it.suggestedDueAt),
          notes: it.notes ?? "",
          pointsPossible: "",
          keep: true,
        })),
      );
      setPhase("review");
    } catch (err) {
      setPhase("pick");
      setError(err instanceof Error ? err.message : "Couldn't read that image. Please try again.");
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmImport() {
    if (!course || importing) return;
    const kept = items.filter((i) => i.keep && i.title.trim());
    if (!kept.length) {
      close();
      return;
    }
    setImporting(true);
    const count = await onImport(
      course.id,
      kept.map((i) => ({
        title: i.title.trim(),
        dueAt: i.dueAt || null,
        description: i.notes.trim() || null,
        pointsPossible: i.pointsPossible ? Number(i.pointsPossible) : null,
      })),
    );
    setImporting(false);
    if (count) toast(`Added ${count} assignment${count === 1 ? "" : "s"} ✓`, "success");
    close();
  }

  if (course && phase === "loading") return <BrainDumpLoader source="image" />;

  return (
    <Modal
      open={!!course}
      onClose={close}
      title={course ? `Import from screenshot · ${course.name}` : "Import from screenshot"}
    >
      {!enabled ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Screenshot import is a Student+ feature.{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline" onClick={close}>
              Upgrade to Student+
            </Link>{" "}
            to use it.
          </span>
        </div>
      ) : phase === "review" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Found {items.length} item{items.length === 1 ? "" : "s"} — uncheck anything that isn&apos;t a real
            assignment, then import.
          </p>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {items.map((it, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  it.keep ? "border-border" : "border-border/50 opacity-50",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={it.keep}
                    onChange={(e) => patch(i, { keep: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={it.title}
                      onChange={(e) => patch(i, { title: e.target.value })}
                      placeholder="Assignment title"
                      className="h-9"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={it.dueAt}
                        onChange={(e) => patch(i, { dueAt: e.target.value })}
                        className="h-9"
                      />
                      <Input
                        inputMode="decimal"
                        placeholder="Points"
                        value={it.pointsPossible}
                        onChange={(e) => patch(i, { pointsPossible: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={confirmImport} loading={importing}>
              Import {items.filter((i) => i.keep).length || ""} assignment
              {items.filter((i) => i.keep).length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="flex-1 text-muted-foreground">{error}</p>
              <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            A photo of a Canvas assignments page, a syllabus, or a planner — LifeOS reads every assignment off it.
          </p>
          <p className="text-xs text-muted-foreground/70">
            This only pulls in assignment titles, due dates and points possible — not grades, scores, or
            anything else. Add scores yourself once they&apos;re back.
          </p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />
          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={atLimit}
          >
            <Camera className="h-4 w-4" /> Choose a screenshot
          </Button>
          {atLimit && (
            <p className="text-center text-xs text-muted-foreground">
              You&apos;ve used your {weeklyLimit} screenshot import{weeklyLimit === 1 ? "" : "s"} for this
              week.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
