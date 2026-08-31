"use client";

import { useState } from "react";
import {
  Plus,
  GraduationCap,
  Plug,
  Trash2,
  BookOpen,
  ChevronDown,
  ListPlus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { useAppData } from "@/lib/store/app-data";
import {
  SCHOOL_INTEGRATIONS,
  CALENDAR_INTEGRATIONS,
  type IntegrationCardInfo,
} from "@/lib/integrations/descriptors";
import { relativeDue, fmtDate, timeAgo, isStaleOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCanvas } from "@/lib/canvas/use-canvas";
import { ConnectCanvas } from "@/components/canvas/connect-canvas";
import { CanvasCoursePicker } from "@/components/canvas/course-picker";
import { CanvasBadge, OpenInCanvas } from "@/components/canvas/canvas-badge";
import { AssignmentDetail } from "@/components/app/assignment-detail";
import type { AssignmentDTO, CourseDTO } from "@/lib/types";

const COURSE_COLORS = ["#22d67e", "#14c9b8", "#4f7dff", "#a855f7", "#ec4899", "#f59e0b", "#ef4444"];

export function SchoolView() {
  const {
    data,
    addCourse,
    updateCourse,
    deleteCourse,
    addAssignment,
    updateAssignment,
    deleteAssignment,
  } = useAppData();
  const [courseModal, setCourseModal] = useState(false);
  const [assignFor, setAssignFor] = useState<CourseDTO | null>(null);
  const [detailFor, setDetailFor] = useState<AssignmentDTO | null>(null);

  const courses = data.courses;
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
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              updateCourse={updateCourse}
              deleteCourse={deleteCourse}
              updateAssignment={updateAssignment}
              deleteAssignment={deleteAssignment}
              onOpenAssignment={setDetailFor}
              onAddAssignment={() => setAssignFor(c)}
            />
          ))}
        </div>
      )}

      <section className="mt-12">
        <div className="divider-gradient mb-8" />
        <h2 className="text-xl font-semibold tracking-tight">Connect your school</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Connect Canvas to import your courses and assignments automatically. We connect
          through Canvas&apos;s official OAuth and district-approved access —{" "}
          <span className="font-medium text-foreground">never by asking for your school password.</span>
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

        <h3 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Calendar sync
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CALENDAR_INTEGRATIONS.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </div>
      </section>

      <CourseEditor open={courseModal} onClose={() => setCourseModal(false)} onCreate={addCourse} />
      <AssignmentEditor course={assignFor} onClose={() => setAssignFor(null)} onCreate={addAssignment} />
      <AssignmentDetail assignment={detailAssignment} onClose={() => setDetailFor(null)} />
    </>
  );
}

function CourseCard({
  course,
  updateCourse,
  deleteCourse,
  updateAssignment,
  deleteAssignment,
  onOpenAssignment,
  onAddAssignment,
}: {
  course: CourseDTO;
  updateCourse: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  onOpenAssignment: (a: AssignmentDTO) => void;
  onAddAssignment: () => void;
}) {
  // Hide assignments that have been open and overdue for weeks — abandoned clutter.
  // Turned-in / graded work stays (it's the grade record).
  const assignments = course.assignments.filter(
    (a) => !(a.status === "open" && isStaleOverdue(a.dueAt)),
  );
  const [open, setOpen] = useState(assignments.length > 0);
  const [grade, setGrade] = useState(course.currentGrade ?? "");
  const openCount = assignments.filter((a) => a.status === "open").length;

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
          {course.instructor && <p className="text-xs text-muted-foreground">{course.instructor}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-20 text-center text-sm"
            placeholder="Grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            onBlur={() =>
              grade !== (course.currentGrade ?? "") &&
              updateCourse(course.id, { currentGrade: grade || null })
            }
          />
          <button
            onClick={() => confirm(`Delete ${course.name}?`) && deleteCourse(course.id)}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Delete course"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs font-medium text-primary"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
          {openCount > 0 && ` · ${openCount} open`}
        </button>
        <Button size="sm" variant="ghost" onClick={onAddAssignment}>
          <Plus className="h-3.5 w-3.5" /> Assignment
        </Button>
      </div>

      {open && assignments.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06] animate-slide-up">
          {assignments.map((a) => {
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
                        {a.gradeValue ? ` · ${a.gradeValue}` : ""}
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
                  <Input
                    className="h-8 w-16 text-center text-xs"
                    placeholder="A / 92%"
                    defaultValue={a.gradeValue ?? ""}
                    onBlur={(e) => updateAssignment(a.id, { gradeValue: e.target.value || null })}
                  />
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

function CanvasIntegrationCard() {
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
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/settings?tab=school")}>
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

function IntegrationCard({ integration }: { integration: IntegrationCardInfo }) {
  const [msg, setMsg] = useState<string | null>(null);
  const comingSoon = integration.status === "coming_soon";
  const busy = false;

  function connect() {
    setMsg(
      `${integration.name} isn't available yet — it will connect through an official API / approved integration in a future release. We'll never ask for your school password.`,
    );
  }

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
            <Plug className="h-4 w-4" />
          </div>
          <span className="font-medium">{integration.name}</span>
        </div>
        <Badge tone={comingSoon ? "muted" : "success"}>{comingSoon ? "Coming soon" : "Available"}</Badge>
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground">{integration.blurb}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4 self-start"
        disabled={comingSoon}
        loading={busy}
        onClick={connect}
      >
        {comingSoon ? "Not available yet" : "Connect"}
      </Button>
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
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
    const res = await onCreate(form);
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
          <Field label="Instructor (optional)">
            <Input
              value={form.instructor}
              onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              placeholder="Ms. Rivera"
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
  const [form, setForm] = useState({ title: "", dueAt: "", description: "" });
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
    });
    setSaving(false);
    if (res) {
      onClose();
      setForm({ title: "", dueAt: "", description: "" });
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
        <Field label="Due date (optional)">
          <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
        </Field>
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
