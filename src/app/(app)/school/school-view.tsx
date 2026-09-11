"use client";

import { useState } from "react";
import {
  Plus,
  GraduationCap,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Folder,
  ListPlus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { confirm } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/input";
import { useAppData } from "@/lib/store/app-data";
import { SCHOOL_INTEGRATIONS } from "@/lib/integrations/descriptors";
import { IntegrationCard } from "@/components/app/integration-card";
import { relativeDue, fmtDate, timeAgo, courseNameWithTeacher, lastName } from "@/lib/format";
import { assignmentGradeLabel, courseGrade, fmtPct } from "@/lib/grades";
import { cn } from "@/lib/utils";
import { useCanvas } from "@/lib/canvas/use-canvas";
import { ConnectCanvas } from "@/components/canvas/connect-canvas";
import { CanvasCoursePicker } from "@/components/canvas/course-picker";
import { CanvasBadge, OpenInCanvas } from "@/components/canvas/canvas-badge";
import { AssignmentDetail } from "@/components/app/assignment-detail";
import type { AssignmentDTO, CourseDTO } from "@/lib/types";

const COURSE_COLORS = ["#22d67e", "#14c9b8", "#4f7dff", "#a855f7", "#ec4899", "#f59e0b", "#ef4444"];

const SOURCE_NOTE: Record<"canvas" | "computed" | "manual", string> = {
  canvas: "synced from Canvas",
  computed: "calculated from graded assignments",
  manual: "you entered",
};

export function SchoolView() {
  const {
    data,
    addCourse,
    deleteCourse,
    addAssignment,
    updateAssignment,
    deleteAssignment,
  } = useAppData();
  const [courseModal, setCourseModal] = useState(false);
  const [assignFor, setAssignFor] = useState<CourseDTO | null>(null);
  const [detailFor, setDetailFor] = useState<AssignmentDTO | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const courses = data.courses;
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
          <Button onClick={() => setCourseModal(true)}>
            <Plus className="h-4 w-4" /> Add course
          </Button>
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
            deleteCourse={async (id) => {
              await deleteCourse(id);
              setOpenId(null);
            }}
            updateAssignment={updateAssignment}
            deleteAssignment={deleteAssignment}
            onOpenAssignment={setDetailFor}
            onAddAssignment={() => setAssignFor(openCourse)}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseFolder key={c.id} course={c} onOpen={() => setOpenId(c.id)} />
          ))}
        </div>
      )}

      {!openCourse && (
        <section className="mt-12">
          <div className="divider-gradient mb-8" />
          <h2 className="text-xl font-semibold tracking-tight">Connect your school</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Connect Canvas to import your courses and assignments automatically. We connect
            through Canvas&apos;s official OAuth and district-approved access —{" "}
            <span className="font-medium text-foreground">
              never by asking for your school password.
            </span>
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {SCHOOL_INTEGRATIONS.map((i) =>
              i.id === "canvas" ? (
                <CanvasIntegrationCard key={i.id} />
              ) : (
                <IntegrationCard key={i.id} integration={i} />
              ),
            )}
          </div>
        </section>
      )}

      <CourseEditor open={courseModal} onClose={() => setCourseModal(false)} onCreate={addCourse} />
      <AssignmentEditor course={assignFor} onClose={() => setAssignFor(null)} onCreate={addAssignment} />
      <AssignmentDetail assignment={detailAssignment} onClose={() => setDetailFor(null)} />
    </>
  );
}

/** A closed folder in the School grid. Click it to open the course. */
function CourseFolder({ course, onOpen }: { course: CourseDTO; onOpen: () => void }) {
  const g = courseGrade(course);
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
  deleteCourse,
  updateAssignment,
  deleteAssignment,
  onOpenAssignment,
  onAddAssignment,
}: {
  course: CourseDTO;
  deleteCourse: (id: string) => Promise<void>;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  onOpenAssignment: (a: AssignmentDTO) => void;
  onAddAssignment: () => void;
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

  const [open, setOpen] = useState(true);
  const g = courseGrade(course);

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
      </div>

      {open && visible.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06] animate-slide-up">
          {visible.map((a) => {
            const due = relativeDue(a.dueAt);
            const past = a.status === "open" && Boolean(due?.past);
            const upcoming = a.status === "open" && !!due && !due.past;
            return (
              <li key={a.id} className={cn("flex flex-wrap items-center gap-3 py-3", past && "opacity-60")}>
                <button
                  onClick={() => onOpenAssignment(a)}
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
                {due && a.status !== "graded" && <Badge tone={due.tone}>{due.label}</Badge>}
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
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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

  if (assignment.provider === "canvas") {
    return (
      <span className="w-20 text-center text-xs font-medium text-muted-foreground">
        {assignmentGradeLabel(assignment) ?? "—"}
      </span>
    );
  }

  const commit = () => {
    const e = parseNum(earned);
    const p = parseNum(possible);
    if (e === (assignment.pointsEarned ?? null) && p === (assignment.pointsPossible ?? null)) return;
    onSave({ pointsEarned: e, pointsPossible: p });
  };

  return (
    <span className="flex items-center gap-1">
      <Input
        className="h-8 w-12 text-center text-xs"
        inputMode="decimal"
        placeholder="got"
        value={earned}
        onChange={(e) => setEarned(e.target.value)}
        onBlur={commit}
        aria-label="Points earned"
      />
      <span className="text-xs text-muted-foreground">/</span>
      <Input
        className="h-8 w-12 text-center text-xs"
        inputMode="decimal"
        placeholder="of"
        value={possible}
        onChange={(e) => setPossible(e.target.value)}
        onBlur={commit}
        aria-label="Points possible"
      />
    </span>
  );
}

function CanvasIntegrationCard() {
  const router = useRouter();
  const canvas = useCanvas();
  const { status, loading, syncing, busy, connect, connectWithToken, sync } = canvas;
  const connected = status?.connected;
  const attention = status?.status === "error" || status?.status === "reauth_required";

  return (
    <Card className="flex flex-col p-6 sm:col-span-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="font-medium">Canvas LMS</span>
        </div>
        {connected ? (
          <Badge tone={attention ? "warning" : "success"}>
            {status?.status === "reauth_required"
              ? "Reconnect needed"
              : status?.status === "error"
                ? "Sync issue"
                : "Connected"}
          </Badge>
        ) : (
          <Badge tone="muted">Not connected</Badge>
        )}
      </div>

      {loading && !status ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking Canvas…</p>
      ) : connected ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {attention ? (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <span className="text-muted-foreground">
              {status?.school ? `${status.school} · ` : ""}
              Last synced {timeAgo(status?.lastSyncedAt)}
            </span>
          </div>
          {status?.message && <p className="text-xs text-warning">{status.message}</p>}
          {status?.status === "reauth_required" ? (
            <ConnectCanvas status={status} busy={busy} onConnect={(url) => connect(url, "school")} onConnectToken={connectWithToken} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => sync()} loading={syncing}>
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : status?.status === "error" ? "Try again" : "Sync now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={canvas.openCoursePicker}
                disabled={busy || canvas.coursePicker.loading}
              >
                Choose courses
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.push("/settings?tab=school")}>
                Manage in Settings
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Connect Canvas to automatically import your courses, assignments and due
            dates. We connect through Canvas&apos;s official OAuth —{" "}
            <span className="font-medium text-foreground">never your school password.</span>
          </p>
          <ConnectCanvas status={status} busy={busy} onConnect={(url) => connect(url, "school")} onConnectToken={connectWithToken} />
        </div>
      )}
      <CanvasCoursePicker canvas={canvas} />
    </Card>
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
  const [form, setForm] = useState({ title: "", dueAt: "", description: "", pointsPossible: "" });
  const [saving, setSaving] = useState(false);

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
    });
    setSaving(false);
    if (res) {
      onClose();
      setForm({ title: "", dueAt: "", description: "", pointsPossible: "" });
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
