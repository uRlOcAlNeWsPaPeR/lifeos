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
  ImagePlus,
  RefreshCw,
  GripVertical,
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
import { compressForStorage, compressImage } from "@/lib/image";
import {
  alreadyOnCourse,
  canonicalCategory,
  groupByCategory,
  mergeCourseWeights,
  mergeItems,
  mergeWeights,
  type ScreenshotDraft,
} from "@/lib/screenshot-merge";
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
  } = useAppData();
  const [courseModal, setCourseModal] = useState(false);
  const [assignFor, setAssignFor] = useState<CourseDTO | null>(null);
  // Which course's screenshot window is open, and whether it opened straight
  // into re-reading that course's saved screenshots ("recheck").
  const [screenshotForId, setScreenshotForId] = useState<string | null>(null);
  const [screenshotIntent, setScreenshotIntent] = useState<"manage" | "recheck">("manage");
  const openScreenshots = (id: string, intent: "manage" | "recheck") => {
    setScreenshotIntent(intent);
    setScreenshotForId(id);
  };
  const [weightsFor, setWeightsFor] = useState<CourseDTO | null>(null);
  const [detailFor, setDetailFor] = useState<AssignmentDTO | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const courses = data.courses;
  const scale = useMemo(
    () => resolveGradeScale(data.profile.prefs.gradeScale),
    [data.profile.prefs.gradeScale],
  );
  const openCourse = openId ? courses.find((c) => c.id === openId) ?? null : null;
  // Live copy, so saved-screenshot counts stay current while the window is open.
  const screenshotFor = screenshotForId ? courses.find((c) => c.id === screenshotForId) ?? null : null;
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
            onImportScreenshot={() => openScreenshots(openCourse.id, "manage")}
            onRecheck={() =>
              // Nothing saved yet → open the window, which explains and offers to add some.
              openScreenshots(openCourse.id, (openCourse.screenshotCount ?? 0) > 0 ? "recheck" : "manage")
            }
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
        intent={screenshotIntent}
        onClose={() => setScreenshotForId(null)}
        onImport={addAssignmentsBatch}
        onSaveWeights={(courseId, rows) =>
          updateCourse(courseId, { gradeWeights: rows.length ? rows : null })
        }
        enabled={data.limits.screenshotImportEnabled}
        atLimit={
          data.limits.screenshotImportsPerWeek !== null &&
          data.limits.screenshotImportsUsedThisWeek >= data.limits.screenshotImportsPerWeek
        }
        weeklyLimit={data.limits.screenshotImportsPerWeek}
        usedThisWeek={data.limits.screenshotImportsUsedThisWeek}
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
  onRecheck,
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
  onRecheck: () => void;
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

  // Drag to reorder; drop into another category section to recategorize.
  const { reorderAssignments } = useAppData();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null); // row id or "cat:<key>"
  const endDrag = () => {
    setDragId(null);
    setDropOn(null);
  };

  /** Drop the dragged assignment onto a row (take its place) or a section (append). */
  async function dropAssignment(targetId: string | null, category?: string) {
    const id = dragId;
    endDrag();
    if (!id || id === targetId) return;
    const moving = course.assignments.find((x) => x.id === id);
    if (!moving) return;
    if (category !== undefined && (moving.category ?? "") !== category) {
      await updateAssignment(id, { category: category || null });
    }
    const ids = course.assignments.map((x) => x.id);
    const from = ids.indexOf(id);
    const to = targetId ? ids.indexOf(targetId) : ids.length - 1;
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    await reorderAssignments(ids);
  }
  const dragProps = (a: AssignmentDTO, category?: string) =>
    selectMode
      ? {}
      : {
          draggable: true,
          dragging: dragId === a.id,
          dropHere: dropOn === a.id && dragId !== a.id,
          onDragStart: () => setDragId(a.id),
          onDragEnd: endDrag,
          onDragOver: (e: React.DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            e.stopPropagation(); // the row, not its section, is the target
            setDropOn(a.id);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            void dropAssignment(a.id, category);
          },
        };

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
          <Button
            size="sm"
            variant="ghost"
            onClick={onRecheck}
            title="Read this course's saved screenshots again and replace what was imported from them"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recheck
          </Button>
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
              <div
                key={grp.key || "__none__"}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setDropOn(`cat:${grp.key}`);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void dropAssignment(null, grp.key);
                }}
                className={cn(
                  "rounded-lg transition-colors",
                  dropOn === `cat:${grp.key}` && "bg-primary/[0.06] ring-1 ring-primary/30",
                )}
              >
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
                {grp.items.length === 0 && dragId && (
                  <p className="py-3 text-center text-xs text-muted-foreground">Drop here to move it to {grp.label}</p>
                )}
                <ul className="divide-y divide-white/[0.06]">
                  {grp.items.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      {...dragProps(a, grp.key)}
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
                {...dragProps(a)}
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
  draggable = false,
  dragging = false,
  dropHere = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
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
  draggable?: boolean;
  dragging?: boolean;
  dropHere?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const due = relativeDue(a.dueAt);
  const past = a.status === "open" && Boolean(due?.past);
  const upcoming = a.status === "open" && !!due && !due.past;

  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "group/row flex flex-wrap items-center gap-3 py-3",
        past && "opacity-60",
        dragging && "opacity-40",
        dropHere && "shadow-[inset_0_2px_0_hsl(var(--primary))]",
      )}
    >
      {draggable && (
        <GripVertical
          className="-ml-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover/row:text-muted-foreground active:cursor-grabbing"
          aria-hidden="true"
        />
      )}
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
            onChange={(e) => updateAssignment(a.id, { status: e.target.value, statusByUser: true })}
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

interface ScreenshotAiItem {
  title: string;
  notes: string | null;
  suggestedDueAt: string | null;
  pointsPossible: number | null;
  pointsEarned: number | null;
  gradeValue: string | null;
  /** The course the item belongs to, as printed. */
  category: string | null;
  /** The gradebook category it sits under — "Formative", "Tests". */
  gradeCategory: string | null;
}

/** A screenshot chosen but not yet read — held until the student hits "Read". */
interface StagedShot {
  key: string;
  file: File;
  /** Object URL for the thumbnail; revoked when the shot is removed. */
  url: string;
}

/** Most screenshots held at once — bounds the thumbnails kept in memory. */
const MAX_STAGED = 20;

/** A row of the gradebook's weight table, as read off the screenshot. */
interface ScreenshotAiCategory {
  name: string;
  weight: number | null;
}

/**
 * Point this at a course, snap (or upload) a photo of its assignment list —
 * a Canvas page, a printed syllabus, a planner — and LifeOS reads every item
 * off it into the same review-then-commit flow as adding one by hand.
 */
function AssignmentScreenshotImporter({
  course,
  intent,
  onClose,
  onImport,
  onSaveWeights,
  enabled,
  atLimit,
  weeklyLimit,
  usedThisWeek,
}: {
  course: CourseDTO | null;
  /** "recheck" opens straight into re-reading the course's saved screenshots. */
  intent: "manage" | "recheck";
  onClose: () => void;
  onImport: (
    courseId: string,
    items: {
      title: string;
      dueAt: string | null;
      description: string | null;
      pointsPossible: number | null;
      pointsEarned: number | null;
      gradeValue: string | null;
      category: string | null;
      status: string;
    }[],
    opts?: { replaceScreenshot?: boolean },
  ) => Promise<number>;
  /** Saves the weight table read off the screenshot onto the course. */
  onSaveWeights: (courseId: string, rows: { category: string; weight: number }[]) => Promise<void>;
  enabled: boolean;
  atLimit: boolean;
  weeklyLimit: number | null;
  /** Screenshot imports already used this week — each screenshot read counts. */
  usedThisWeek: number;
}) {
  const [phase, setPhase] = useState<"pick" | "loading" | "review">("pick");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScreenshotDraft[]>([]);
  // The weight table read off the screenshot, editable before it's applied.
  const [weightDrafts, setWeightDrafts] = useState<WeightDraft[]>([]);
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsApplied, setWeightsApplied] = useState(false);
  const [importing, setImporting] = useState(false);
  // While extra screenshots are being read from the review screen: which one.
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  // How many screenshots have contributed to this review.
  const [shots, setShots] = useState(0);
  // A non-error heads-up after reading — merged repeats, skipped files.
  const [notice, setNotice] = useState<string | null>(null);
  // Chosen but not yet read. Nothing is sent to the AI until "Read" is pressed,
  // so a long page can be assembled from several shots first.
  const [staged, setStaged] = useState<StagedShot[]>([]);
  const stagedRef = useRef<StagedShot[]>([]);
  stagedRef.current = staged;
  // Files already read into this review, kept so "Recheck" can read them again
  // without the student picking them a second time.
  const [readFiles, setReadFiles] = useState<{ key: string; file: File }[]>([]);
  const [confirmRecheck, setConfirmRecheck] = useState(false);
  const { listCourseScreenshots, saveCourseScreenshots, deleteCourseScreenshots } = useAppData();
  // Screenshots already saved with this course (thumbnails as data URLs).
  const [saved, setSaved] = useState<{ id: string; image: string; mimeType: string }[] | null>(null);
  // Rechecking: importing replaces the course's earlier screenshot imports.
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const openedFor = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  // The latest lists, so a batch merges into what the student sees now rather
  // than into the copy this closure was created with.
  const itemsRef = useRef<ScreenshotDraft[]>([]);
  const weightDraftsRef = useRef<WeightDraft[]>([]);
  itemsRef.current = items;
  weightDraftsRef.current = weightDrafts;

  // Screenshots this week's allowance still covers.
  const remaining = weeklyLimit === null ? Infinity : Math.max(0, weeklyLimit - usedThisWeek);
  // How many can be lined up: the allowance, and never more than MAX_STAGED.
  const stagingRoom = Math.max(0, Math.min(remaining, MAX_STAGED) - staged.length);

  useEffect(
    () => () => {
      for (const st of stagedRef.current) URL.revokeObjectURL(st.url);
    },
    [],
  );

  // When the window opens on a course: load what's saved, and for "recheck"
  // line all of it up and read it straight away.
  useEffect(() => {
    if (!course || !enabled) return;
    const tag = `${course.id}|${intent}`;
    if (openedFor.current === tag) return;
    openedFor.current = tag;
    if (!(course.screenshotCount ?? 0)) {
      setSaved([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listCourseScreenshots(course.id);
        if (cancelled) return;
        setSaved(list);
        if (intent === "recheck" && list.length) {
          const shots: StagedShot[] = list.map((sv) => {
            const bin = atob(sv.image);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], `saved-${sv.id}.jpg`, { type: sv.mimeType });
            return { key: `saved:${sv.id}`, file, url: URL.createObjectURL(file) };
          });
          stagedRef.current = shots;
          setStaged(shots);
          setReplacing(true);
          void readStaged();
        }
      } catch {
        if (!cancelled) {
          setSaved([]);
          setError("Couldn't load the saved screenshots. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
      // Let a re-run (React strict mode) start over rather than get stuck.
      if (openedFor.current === tag) openedFor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, intent, enabled]);

  function reset() {
    setPhase("pick");
    setError(null);
    setItems([]);
    setImporting(false);
    setWeightDrafts([]);
    setWeightsApplied(false);
    setAdding(null);
    setShots(0);
    setNotice(null);
    setReadFiles([]);
    setConfirmRecheck(false);
    setSaved(null);
    setReplacing(false);
    setDeleting(false);
    openedFor.current = null;
    setStaged((cur) => {
      for (const st of cur) URL.revokeObjectURL(st.url);
      return [];
    });
  }

  function close() {
    reset();
    onClose();
  }

  /**
   * Categories offered per row: the course's declared weights first (those are
   * what the weighted grade actually reads), then anything new the screenshot
   * showed, matched case-insensitively so one category can't appear twice.
   */
  const categoryOptions = (() => {
    const out: { category: string; weight: number | null }[] = [];
    const seen = new Set<string>();
    for (const w of byWeightDesc(course?.gradeWeights ?? [])) {
      seen.add(w.category.toLowerCase());
      out.push({ category: w.category, weight: w.weight });
    }
    for (const d of weightDrafts) {
      const name = d.category.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ category: name, weight: parseNum(d.weight) });
    }
    return out;
  })();

  // The review laid out the way the gradebook is: a section per category, in
  // the screenshot's order, each with its weight.
  const groups = groupByCategory(
    items,
    weightDrafts.map((d) => ({ category: d.category, weight: parseNum(d.weight) })),
    course?.gradeWeights ?? [],
  );

  const weightTotal = weightDrafts.reduce((n, r) => n + (parseNum(r.weight) ?? 0), 0);

  // Kept rows with no category — they won't count toward any weighted bucket.
  const untaggedCount = items.filter((i) => i.keep && !i.category).length;

  function tagUntagged(category: string) {
    if (!category) return;
    setItems((cur) => cur.map((it) => (it.keep && !it.category ? { ...it, category } : it)));
  }

  async function applyWeights() {
    if (!course || savingWeights) return;
    const rows = weightDrafts
      .map((r) => ({ category: r.category.trim(), weight: parseNum(r.weight) ?? 0 }))
      .filter((r) => r.category && r.weight > 0);
    if (!rows.length) return;
    setSavingWeights(true);
    await onSaveWeights(course.id, rows);
    setSavingWeights(false);
    setWeightsApplied(true);
  }

  function patch(i: number, p: Partial<ScreenshotDraft>) {
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }

  /** Line up screenshots without reading them — that waits for "Read". */
  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setNotice(null);

    const have = new Set(stagedRef.current.map((x) => x.key));
    const fresh: StagedShot[] = [];
    for (const file of files) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (have.has(key)) continue; // the same file picked twice
      have.add(key);
      fresh.push({ key, file, url: URL.createObjectURL(file) });
    }
    const room = stagingRoom;
    const accepted = fresh.slice(0, room);
    for (const dropped of fresh.slice(room)) URL.revokeObjectURL(dropped.url);
    if (fresh.length > accepted.length) {
      setNotice(
        remaining <= MAX_STAGED && remaining !== Infinity
          ? `That's all the screenshots this week's allowance covers — ${accepted.length} added, the rest were left out.`
          : `You can line up ${MAX_STAGED} at a time — ${accepted.length} added, the rest were left out.`,
      );
    }
    if (accepted.length) setStaged((cur) => [...cur, ...accepted]);
  }

  function removeStaged(key: string) {
    setStaged((cur) => {
      const gone = cur.find((x) => x.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((x) => x.key !== key);
    });
  }

  /**
   * Read everything lined up and fold it into the review.
   *
   * They're read one at a time, in the order added, because a page shot in
   * pieces only makes sense top to bottom. Each screenshot is its own billed AI
   * call, so the batch is cut to what this week's allowance still covers.
   * Screenshots that were read (even if they held nothing) are cleared from the
   * line-up; one that failed stays, with everything after it, so a retry
   * doesn't mean picking them again. Whatever was read before a failure is kept.
   */
  async function readStaged() {
    const queue = stagedRef.current;
    if (!queue.length || !course || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);

    const hadReview = itemsRef.current.length > 0 || weightDraftsRef.current.length > 0;
    const batch = queue.slice(0, Math.min(queue.length, remaining));
    const overQuota = queue.length - batch.length;
    setPhase("loading");

    const weights = course.gradeWeights ?? [];
    let addedTotal = 0;
    let mergedTotal = 0;
    let useful = 0;
    let categoriesOnly = 0;
    let empty = 0;
    let consumed = 0;
    let failure: string | null = null;
    let whatItSaw: string | null = null;

    try {
      for (let i = 0; i < batch.length; i++) {
        setAdding({ done: i, total: batch.length });
        let res: { items: ScreenshotAiItem[]; categories?: ScreenshotAiCategory[]; summary?: string };
        try {
          const { data: image, mimeType } = await compressImage(batch[i].file);
          res = await authedApi("/api/brain-dump/image", { method: "POST", body: { image, mimeType } });
        } catch (err) {
          // A failed screenshot stops the batch (a rate limit or outage would
          // fail the rest too) but keeps everything already read.
          failure = err instanceof Error ? err.message : "Couldn't read that image. Please try again.";
          break;
        }
        consumed++;
        const detected = res.categories ?? [];
        const gotItems = (res.items?.length ?? 0) > 0;
        // A screenshot of just the weight table has no assignments but is still
        // a complete, useful read — it's how Canvas shows "Assignment Groups".
        if (!gotItems && !detected.length) {
          empty++;
          const said = res.summary?.trim();
          if (said && !/^Found 0 /i.test(said)) whatItSaw = said;
          continue;
        }
        useful++;
        if (!gotItems) categoriesOnly++;

        // Categories this screenshot showed, plus every one already known — so
        // "formative" here lands in the same bucket as "Formative" from the
        // first shot, and the course's own spelling always wins.
        const known = [
          ...weights.map((w) => w.category),
          ...weightDraftsRef.current.map((d) => d.category),
          ...detected.map((c) => c.name),
        ];
        const incoming: ScreenshotDraft[] = (res.items ?? []).map((it) => ({
          title: it.title,
          dueAt: toInputDate(it.suggestedDueAt),
          notes: it.notes ?? "",
          pointsPossible: it.pointsPossible != null ? String(it.pointsPossible) : "",
          pointsEarned: it.pointsEarned != null ? String(it.pointsEarned) : "",
          gradeValue: it.gradeValue ?? "",
          // The gradebook category is the one grade weights use; the plain
          // `category` is the course name, which isn't a weight bucket.
          category: canonicalCategory(it.gradeCategory, known),
          keep: true,
        }));

        const merged = mergeItems(itemsRef.current, incoming);
        itemsRef.current = merged.items;
        setItems(merged.items);
        addedTotal += merged.added;
        mergedTotal += merged.merged;

        const nextWeights = mergeWeights(
          weightDraftsRef.current,
          detected.map((c) => ({ category: c.name, weight: c.weight != null ? String(c.weight) : "" })),
        );
        weightDraftsRef.current = nextWeights;
        setWeightDrafts(nextWeights);
        // New categories or weights mean what was saved to the course is stale.
        setWeightsApplied(false);
      }
    } finally {
      setAdding(null);
      inFlight.current = false;
    }

    // Read ones leave the line-up; a failed one and everything after stays.
    const done = new Set(batch.slice(0, consumed).map((x) => x.key));
    setStaged((cur) => {
      for (const st of cur) if (done.has(st.key)) URL.revokeObjectURL(st.url);
      return cur.filter((x) => !done.has(x.key));
    });
    setShots((n) => n + useful);
    setReadFiles((cur) => [
      ...cur,
      ...batch.slice(0, consumed).map((x) => ({ key: x.key, file: x.file })),
    ]);

    // Nothing usable, and nothing already on screen to fall back to: go back to
    // the line-up with the reason, so the student can swap a shot and retry.
    if (useful === 0 && !hadReview) {
      setPhase("pick");
      setError(
        failure ??
          `That doesn't look like a screenshot of assignments or a grade breakdown${
            whatItSaw ? ` — LifeOS read it as: “${whatItSaw}”` : ""
          }. Try a clearer screenshot of a Canvas grades page, a syllabus, or a planner.`,
      );
      return;
    }

    setPhase(useful > 0 || hadReview ? "review" : "pick");
    if (failure) setError(failure);

    const notes: string[] = [];
    if (categoriesOnly && addedTotal === 0 && mergedTotal === 0) {
      notes.push(
        "That screenshot showed the grade weights but no assignments — check them below, or add a screenshot of the assignment list.",
      );
    }
    if (mergedTotal) {
      notes.push(
        `${mergedTotal} repeated assignment${mergedTotal === 1 ? "" : "s"} where the screenshots overlapped ${
          mergedTotal === 1 ? "was" : "were"
        } combined.`,
      );
    }
    if (empty) {
      notes.push(
        `${empty} screenshot${empty === 1 ? "" : "s"} had nothing to read${
          whatItSaw ? ` (LifeOS saw: “${whatItSaw}”)` : ""
        }.`,
      );
    }
    if (overQuota > 0) {
      notes.push(`Only ${batch.length} of ${queue.length} were read — that's all the screenshot imports left this week.`);
    }
    setNotice(notes.length ? notes.join(" ") : null);
  }

  /**
   * Throw away what was read and read every screenshot again from scratch — for
   * when the AI misread something. Screenshots still lined up (not yet read)
   * are read too. Edits made in the review are replaced, hence the confirm.
   */
  function recheckAll() {
    if (!readFiles.length || inFlight.current) return;
    setConfirmRecheck(false);
    const again: StagedShot[] = readFiles.map((r) => ({
      key: r.key,
      file: r.file,
      url: URL.createObjectURL(r.file),
    }));
    const queue = [...again, ...stagedRef.current];
    stagedRef.current = queue;
    setStaged(queue);
    setReadFiles([]);
    itemsRef.current = [];
    weightDraftsRef.current = [];
    setItems([]);
    setWeightDrafts([]);
    setWeightsApplied(false);
    setShots(0);
    void readStaged();
  }

  /** Delete every saved screenshot and the assignments that came from them — after a yes/no. */
  async function deleteSaved() {
    if (!course || !saved?.length || deleting) return;
    const fromShots = course.assignments.filter((a) => a.fromScreenshot && !a.editedByUser).length;
    const edited = course.assignments.filter((a) => a.fromScreenshot && a.editedByUser).length;
    const yes = await confirm({
      title: "Delete all screenshots?",
      body: `This removes the ${saved.length} saved screenshot${saved.length === 1 ? "" : "s"}${
        fromShots
          ? ` and the ${fromShots} assignment${fromShots === 1 ? "" : "s"} imported from them`
          : ""
      }. Assignments you added yourself${edited ? " or edited" : ""} stay.`,
      confirmLabel: "Yes, delete",
      cancelLabel: "No",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    try {
      await deleteCourseScreenshots(course.id);
      setSaved([]);
      toast("Screenshots deleted", "success");
    } catch {
      setError("Couldn't delete the screenshots. Please try again.");
    }
    setDeleting(false);
  }

  async function confirmImport() {
    if (!course || importing) return;
    const kept = items.filter((i) => i.keep && i.title.trim());
    if (!kept.length) {
      close();
      return;
    }
    setImporting(true);
    // Make the course's weights match the screenshot's table so the assignments
    // land in real categories on the course page. A failed save must not lose
    // the import, so it's best-effort.
    const shown = weightDrafts
      .map((r) => ({ category: r.category.trim(), weight: parseNum(r.weight) ?? 0 }))
      .filter((r) => r.category && r.weight > 0);
    const declared = course.gradeWeights ?? [];
    const merged = mergeCourseWeights(declared, shown);
    const changed =
      merged.length !== declared.length ||
      merged.some((w, k) => w.weight !== declared[k]?.weight || w.category !== declared[k]?.category);
    if (changed) {
      try {
        await onSaveWeights(course.id, merged);
      } catch {
        /* keep going — the assignments matter more */
      }
    }
    const known = merged.map((w) => w.category);
    // Adding to a course that already has assignments: leave out the ones it
    // already holds (a new screenshot overlapping an earlier import). When
    // rechecking, the earlier screenshot imports are being replaced, so only
    // the ones added some other way count as already there.
    // Rechecking replaces the earlier imports, except ones the student edited.
    const fresh = kept.filter((i) => !alreadyOnCourse(course.assignments, i, replacing));
    const skipped = kept.length - fresh.length;
    const count = await onImport(
      course.id,
      fresh.map((i) => {
        const pointsEarned = i.pointsEarned ? Number(i.pointsEarned) : null;
        const gradeValue = i.gradeValue.trim() || null;
        return {
          title: i.title.trim(),
          dueAt: i.dueAt || null,
          description: i.notes.trim() || null,
          pointsPossible: i.pointsPossible ? Number(i.pointsPossible) : null,
          pointsEarned,
          gradeValue,
          // Same spelling as the saved weight, so it groups on the course page.
          category: canonicalCategory(i.category, known) || null,
          // A captured score/grade means the screenshot already shows this as
          // graded — matches how a grade is treated everywhere else in the app.
          status: pointsEarned != null || gradeValue ? "graded" : "open",
        };
      }),
      { replaceScreenshot: replacing },
    );
    // Keep the new screenshots with the course so they can be rechecked later.
    // Best-effort: a failure here must not undo an import that already worked.
    const toSave = readFiles.filter((r) => !r.key.startsWith("saved:"));
    if (toSave.length) {
      try {
        const packed = (await Promise.all(toSave.map((r) => compressForStorage(r.file)))).filter(
          (x): x is { data: string; mimeType: string } => !!x,
        );
        await saveCourseScreenshots(
          course.id,
          packed.map((x) => ({ image: x.data, mimeType: x.mimeType })),
        );
      } catch {
        /* the assignments are in; only Recheck for these is lost */
      }
    }
    setImporting(false);
    if (count || skipped) {
      toast(
        `${replacing ? "Replaced with" : "Added"} ${count} assignment${count === 1 ? "" : "s"} ✓${
          skipped ? ` (${skipped} already in this course)` : ""
        }`,
        "success",
      );
    }
    close();
  }

  if (course && phase === "loading") {
    return (
      <BrainDumpLoader
        source="image"
        detail={adding && adding.total > 1 ? `Screenshot ${adding.done + 1} of ${adding.total}` : undefined}
      />
    );
  }

  return (
    <Modal
      open={!!course}
      onClose={close}
      title={course ? `Import from screenshot · ${course.name}` : "Import from screenshot"}
    >
      {/* One input for every screen — the picker's button and the review
          screen's "add more" both open it. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFilesChosen}
        aria-hidden
        tabIndex={-1}
      />
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
            {items.length === 0
              ? "No assignments yet — save the weights below, then add a screenshot of the assignment list."
              : `Found ${items.length} item${items.length === 1 ? "" : "s"}${
                  shots > 1 ? ` across ${shots} screenshots` : ""
                } — uncheck anything that isn't a real assignment, then import.`}
          </p>

          {replacing && (
            <p className="rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs">
              Rechecking — importing replaces the{" "}
              {course?.assignments.filter((a) => a.fromScreenshot && !a.editedByUser).length ?? 0}{" "}
              assignments from your earlier screenshots with what&apos;s below.
              {(course?.assignments.filter((a) => a.fromScreenshot && a.editedByUser).length ?? 0) > 0 &&
                ` The ${course!.assignments.filter((a) => a.fromScreenshot && a.editedByUser).length} you edited are kept as you left them.`}
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <p className="flex-1 text-muted-foreground">{error}</p>
              <button onClick={() => setError(null)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* A long page rarely fits one screenshot — add the next piece here and
              the two are combined, with the overlap merged. */}
          <button
            type="button"
            onClick={() => setPhase("pick")}
            disabled={!!adding || remaining === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-white/20 disabled:hover:text-muted-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            Add more screenshots
          </button>
          <p className="-mt-2 text-center text-[11px] text-muted-foreground/70">
            {remaining === 0
              ? `You've used your ${weeklyLimit} screenshot import${weeklyLimit === 1 ? "" : "s"} for this week.`
              : weeklyLimit === null
                ? "Add as many as you need — they're read together, and overlapping assignments are merged."
                : `Add as many as you need — they're read together, and overlaps are merged. ${remaining} of ${weeklyLimit} screenshot import${
                    weeklyLimit === 1 ? "" : "s"
                  } left this week.`}
          </p>
          {readFiles.length > 0 &&
            (confirmRecheck ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2.5">
                <span className="text-xs">
                  Read {readFiles.length === 1 ? "the screenshot" : `all ${readFiles.length} screenshots`} again?
                  Your edits below will be replaced.
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRecheck(false)}>
                    Keep mine
                  </Button>
                  <Button size="sm" onClick={recheckAll}>
                    Recheck
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRecheck(true)}
                disabled={!!adding || remaining === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" />
                Something look wrong? Recheck the screenshots
              </button>
            ))}

          {/* Frozen while another screenshot is being read, so an edit can't
              collide with the merge that's about to land. */}
          <fieldset disabled={!!adding} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {weightDrafts.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Category weights found{weightsApplied ? "" : " in this screenshot"}
                  </p>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      Math.round(weightTotal) === 100 ? "text-muted-foreground" : "text-warning",
                    )}
                  >
                    {weightTotal}% total
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check these against your gradebook — fill in anything blank, then save them to{" "}
                  {course?.name ?? "this course"} so each category counts for the right amount.
                </p>
                <ul className="mt-3 space-y-2">
                  {weightDrafts.map((w, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Input
                        value={w.category}
                        onChange={(e) => {
                          const next = e.target.value;
                          const prev = w.category.trim().toLowerCase();
                          setWeightDrafts((cur) =>
                            cur.map((r, idx) => (idx === i ? { ...r, category: next } : r)),
                          );
                          // Renaming a category carries its assignments with it.
                          if (prev && next.trim()) {
                            setItems((cur) =>
                              cur.map((it) =>
                                it.category.trim().toLowerCase() === prev ? { ...it, category: next } : it,
                              ),
                            );
                          }
                        }}
                        aria-label="Category name"
                        className="h-9 flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          inputMode="decimal"
                          placeholder="—"
                          value={w.weight}
                          onChange={(e) =>
                            setWeightDrafts((cur) =>
                              cur.map((r, idx) => (idx === i ? { ...r, weight: e.target.value } : r)),
                            )
                          }
                          aria-label={`Weight for ${w.category || "category"}`}
                          className="h-9 w-20 text-right"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label={`Remove ${w.category || "category"}`}
                        onClick={() => setWeightDrafts((cur) => cur.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={applyWeights} loading={savingWeights}>
                    {weightsApplied ? "Save again" : "Save weights to course"}
                  </Button>
                  {weightsApplied && (
                    <span className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                  {Math.round(weightTotal) !== 100 && (
                    <span className="text-xs text-muted-foreground">
                      These don&apos;t add up to 100% — that&apos;s fine if the screenshot only showed some.
                    </span>
                  )}
                </div>
              </div>
            )}
            {categoryOptions.length > 0 && untaggedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {untaggedCount} without a category
                  {shots > 1 ? " — a screenshot that starts mid-list often loses its heading" : ""}
                </span>
                <Select
                  className="h-8 w-auto py-0 text-xs"
                  value=""
                  onChange={(e) => tagUntagged(e.target.value)}
                  aria-label="Set a category for every untagged item"
                >
                  <option value="">Set all to…</option>
                  {categoryOptions.map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.category}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {groups.map((g) => (
                <section key={g.key || "none"} className="space-y-2">
                  <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 rounded-md bg-background/95 px-1 py-1.5 backdrop-blur">
                    <h4 className="text-sm font-semibold">
                      {g.label}
                      {g.weight != null && (
                        <span className="ml-1.5 font-normal text-muted-foreground">· {g.weight}%</span>
                      )}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {g.entries.length === 0
                        ? "nothing read yet"
                        : `${g.entries.length} assignment${g.entries.length === 1 ? "" : "s"}`}
                      {g.key && g.weight == null ? " · no weight" : ""}
                    </span>
                  </div>
                  {g.entries.map(({ item: it, index: i }) => (
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
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={it.title}
                          onChange={(e) => patch(i, { title: e.target.value })}
                          placeholder="Assignment title"
                          className="h-9"
                        />
                        {(it.pointsEarned || it.gradeValue) && (
                          <Badge tone="success" className="shrink-0">
                            Graded
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={it.dueAt}
                          onChange={(e) => patch(i, { dueAt: e.target.value })}
                          className="h-9"
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Points possible"
                          value={it.pointsPossible}
                          onChange={(e) => patch(i, { pointsPossible: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      {categoryOptions.length > 0 && (
                        <Select
                          className="h-9"
                          value={it.category}
                          onChange={(e) => patch(i, { category: e.target.value })}
                          aria-label="Grade category"
                        >
                          <option value="">No category — won&apos;t count toward the weighted grade</option>
                          {categoryOptions.map((c) => (
                            <option key={c.category} value={c.category}>
                              {c.category}
                              {c.weight != null ? ` (${c.weight}%)` : ""}
                            </option>
                          ))}
                        </Select>
                      )}
                      {(it.pointsEarned || it.gradeValue) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            inputMode="decimal"
                            placeholder="Score earned"
                            value={it.pointsEarned}
                            onChange={(e) => patch(i, { pointsEarned: e.target.value })}
                            className="h-9"
                          />
                          <Input
                            placeholder="Grade (A-, 95%)"
                            value={it.gradeValue}
                            onChange={(e) => patch(i, { gradeValue: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                  ))}
                </section>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={confirmImport} loading={importing} disabled={!!adding}>
              {items.filter((i) => i.keep).length
                ? `Import ${items.filter((i) => i.keep).length} assignment${
                    items.filter((i) => i.keep).length === 1 ? "" : "s"
                  }`
                : "Done"}
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
          {notice && (
            <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          )}

          {staged.length === 0 && saved && phase === "pick" && (
            <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-medium">
                {saved.length
                  ? `${saved.length} saved screenshot${saved.length === 1 ? "" : "s"} for this course`
                  : "No saved screenshots yet"}
              </p>
              {saved.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Screenshots you import from now on are saved with this course, so you can Recheck them
                  if the AI gets something wrong.
                </p>
              )}
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Saved screenshots">
                {saved.map((sv, i) => (
                  <li
                    key={sv.id}
                    className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a saved data URL, not a hosted image */}
                    <img
                      src={`data:${sv.mimeType};base64,${sv.image}`}
                      alt={`Saved screenshot ${i + 1}`}
                      className="h-full w-full object-cover object-top"
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  loading={deleting}
                  disabled={saved.length === 0}
                  onClick={deleteSaved}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete all screenshots
                </Button>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={stagingRoom === 0}
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Add new screenshots
                </Button>
              </div>
            </div>
          )}

          {staged.length === 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                Screenshots of a Canvas grades page, a syllabus, or a planner — LifeOS reads every
                assignment off them, along with each category&apos;s weight.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Pulls in titles, due dates, points, and the grade weights — and if a score or grade is
                already showing for something, that comes in too and it&apos;s marked graded automatically.
              </p>
              <p className="text-xs text-muted-foreground/70">
                A long page? Add as many screenshots as it takes, then press Read — nothing is sent until
                you do, and they&apos;re combined with any overlap merged.
              </p>
            </>
          )}

          {staged.length === 0 ? (
            <Button
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={stagingRoom === 0}
            >
              <Camera className="h-4 w-4" /> Choose screenshots
            </Button>
          ) : (
            <>
              <p className="text-sm font-medium">
                {staged.length} screenshot{staged.length === 1 ? "" : "s"} ready
              </p>
              <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-label="Screenshots to read">
                {staged.map((st, i) => (
                  <li
                    key={st.key}
                    className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a hosted image */}
                    <img
                      src={st.url}
                      alt={`Screenshot ${i + 1}`}
                      className="h-full w-full object-cover object-top"
                    />
                    <span className="absolute bottom-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1.5 text-[11px] font-medium tabular-nums">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStaged(st.key)}
                      aria-label={`Remove screenshot ${i + 1}`}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/90 transition-colors hover:bg-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {stagingRoom > 0 && (
                  <li className="aspect-[3/4]">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Add another screenshot"
                      className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      <Plus className="h-5 w-5" />
                      <span className="text-xs">Add more</span>
                    </button>
                  </li>
                )}
              </ul>
              <p className="text-[11px] text-muted-foreground/70">
                Numbered in the order they&apos;re read — top of the page first.
                {weeklyLimit !== null &&
                  ` Each one uses a screenshot import; you have ${remaining} of ${weeklyLimit} left this week.`}
              </p>
              <Button className="w-full" onClick={readStaged} disabled={remaining === 0}>
                Read {staged.length} screenshot{staged.length === 1 ? "" : "s"}
              </Button>
            </>
          )}

          {/* Came here from a review to add more — the review is still there. */}
          {(items.length > 0 || weightDrafts.length > 0) && (
            <Button variant="ghost" className="w-full" onClick={() => setPhase("review")}>
              Back to your review ({items.length} item{items.length === 1 ? "" : "s"})
            </Button>
          )}

          {remaining === 0 && staged.length === 0 && (
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
