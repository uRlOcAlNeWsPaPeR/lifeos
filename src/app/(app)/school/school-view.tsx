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
import { relativeDue, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
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
    createTaskForAssignment,
  } = useAppData();
  const [courseModal, setCourseModal] = useState(false);
  const [assignFor, setAssignFor] = useState<CourseDTO | null>(null);

  const courses = data.courses;

  return (
    <>
      <PageHeader
        title="School"
        description="Track courses, assignments and grades. School integrations arrive later through official APIs."
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
              createTaskForAssignment={createTaskForAssignment}
              onAddAssignment={() => setAssignFor(c)}
            />
          ))}
        </div>
      )}

      <section className="mt-12">
        <div className="divider-gradient mb-8" />
        <h2 className="text-xl font-semibold tracking-tight">Connect your school</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          LifeOS will import your courses and assignments automatically once these are available.
          We connect through official APIs and district-approved access —{" "}
          <span className="font-medium text-foreground">never by asking for your school password.</span>
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {SCHOOL_INTEGRATIONS.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
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
    </>
  );
}

function CourseCard({
  course,
  updateCourse,
  deleteCourse,
  updateAssignment,
  deleteAssignment,
  createTaskForAssignment,
  onAddAssignment,
}: {
  course: CourseDTO;
  updateCourse: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  updateAssignment: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  createTaskForAssignment: (id: string) => Promise<void>;
  onAddAssignment: () => void;
}) {
  const [open, setOpen] = useState(course.assignments.length > 0);
  const [grade, setGrade] = useState(course.currentGrade ?? "");
  const openCount = course.assignments.filter((a) => a.status === "open").length;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: course.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{course.name}</p>
            {course.code && <Badge tone="muted">{course.code}</Badge>}
            {course.provider && <Badge tone="primary">{course.provider}</Badge>}
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
          {course.assignments.length} assignment{course.assignments.length === 1 ? "" : "s"}
          {openCount > 0 && ` · ${openCount} open`}
        </button>
        <Button size="sm" variant="ghost" onClick={onAddAssignment}>
          <Plus className="h-3.5 w-3.5" /> Assignment
        </Button>
      </div>

      {open && course.assignments.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06] animate-slide-up">
          {course.assignments.map((a) => {
            const due = relativeDue(a.dueAt);
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", a.status === "graded" && "text-muted-foreground")}>
                    {a.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.dueAt ? fmtDate(a.dueAt, { weekday: "short", month: "short", day: "numeric" }) : "No due date"}
                    {a.gradeValue ? ` · ${a.gradeValue}` : ""}
                  </p>
                </div>
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
                {a.status === "graded" ? (
                  <Input
                    className="h-8 w-16 text-center text-xs"
                    placeholder="A / 92%"
                    defaultValue={a.gradeValue ?? ""}
                    onBlur={(e) => updateAssignment(a.id, { gradeValue: e.target.value || null })}
                  />
                ) : (
                  <button
                    onClick={() => createTaskForAssignment(a.id)}
                    title="Add a task for this"
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ListPlus className="h-4 w-4" />
                  </button>
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
