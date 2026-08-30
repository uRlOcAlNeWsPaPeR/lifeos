"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, ListChecks, CalendarDays, Timer, BellRing } from "lucide-react";
import { TaskEditor, draftToPayload, type TaskDraft } from "@/components/app/task-editor";
import { EventEditor } from "@/app/(app)/calendar/calendar-view";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/store/app-data";
import { cn } from "@/lib/utils";

type Sheet = null | "task" | "event" | "study" | "reminder";

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Floating LifeOS control — expands into quick creators. Every action opens the
 * same editors used elsewhere, so functionality is identical.
 */
export function QuickAdd() {
  const { data, addTask, addEvent, addAlarm } = useAppData();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const goals = useMemo(
    () => data.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title })),
    [data.goals],
  );
  const courses = useMemo(() => data.courses.map((c) => ({ id: c.id, name: c.name })), [data.courses]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const actions: { key: Exclude<Sheet, null>; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "task", label: "Task", icon: ListChecks },
    { key: "event", label: "Event", icon: CalendarDays },
    { key: "study", label: "Study session", icon: Timer },
    { key: "reminder", label: "Reminder", icon: BellRing },
  ];

  async function saveTask(draft: TaskDraft) {
    const payload = draftToPayload(draft);
    await addTask({ ...payload, title: payload.title });
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5 sm:bottom-8 sm:right-8">
        {open &&
          actions.map((a, i) => (
            <button
              key={a.key}
              onClick={() => {
                setSheet(a.key);
                setOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-full border border-white/10 bg-popover/95 py-2 pl-3.5 pr-4 text-sm font-medium shadow-glow-sm backdrop-blur-xl animate-slide-up hover:border-primary/40 hover:text-primary"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <a.icon className="h-4 w-4 text-primary" />
              {a.label}
            </button>
          ))}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close quick add" : "Quick add"}
          aria-expanded={open}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground shadow-glow transition-transform duration-300 hover:shadow-glow-lg active:scale-90",
            open && "rotate-45",
          )}
        >
          <Plus className="h-6 w-6" strokeWidth={2.4} />
        </button>
      </div>

      <TaskEditor
        open={sheet === "task"}
        onClose={() => setSheet(null)}
        onSave={saveTask}
        task={null}
        goals={goals}
        courses={courses}
      />
      <EventEditor
        open={sheet === "event" || sheet === "study"}
        dateKey={todayKey()}
        onClose={() => setSheet(null)}
        onSave={async (p) => {
          await addEvent({
            ...p,
            kind: sheet === "study" ? "study_session" : p.kind,
          });
          setSheet(null);
        }}
      />
      <ReminderSheet
        open={sheet === "reminder"}
        onClose={() => setSheet(null)}
        onSave={async (label, time, sound) => {
          await addAlarm({ label, time, kind: "custom", sound, repeatDays: [], enabled: true });
          setSheet(null);
        }}
      />
    </>
  );
}

function ReminderSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (label: string, time: string, sound: boolean) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("17:00");
  const [sound, setSound] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setTime("17:00");
      setSound(true);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="New reminder">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!label.trim()) return;
          setSaving(true);
          try {
            await onSave(label.trim(), time, sound);
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <Field label="What's the reminder?">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Pack lab report"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Sound">
            <Select value={sound ? "on" : "off"} onChange={(e) => setSound(e.target.value === "on")}>
              <option value="on">Chime</option>
              <option value="off">Silent</option>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Fires as a browser notification while LifeOS is open. Manage all alarms in Settings.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add reminder
          </Button>
        </div>
      </form>
    </Modal>
  );
}
