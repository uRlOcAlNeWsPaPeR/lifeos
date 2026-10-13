"use client";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useAppData } from "@/lib/store/app-data";
import { dayKey } from "@/lib/brain/time";
import { cn } from "@/lib/utils";

/** "A year ago" and friends, as a day string — the way people place old memories. */
function daysBack(years: number, months = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - months);
  return dayKey(d.getTime());
}

const QUICK: { label: string; day: () => string }[] = [
  { label: "Today", day: () => daysBack(0) },
  { label: "Last month", day: () => daysBack(0, 1) },
  { label: "Last year", day: () => daysBack(1) },
  { label: "5 years ago", day: () => daysBack(5) },
  { label: "10 years ago", day: () => daysBack(10) },
];

/**
 * Write something straight into the Brain — a thing you learned, a fact you
 * want to keep, something from way back. The date is the point: it can be any
 * day up to today, so a lesson from elementary school sits where it belongs on
 * the timeline instead of being stamped with today's date.
 */
export function AddMemory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, addMemory } = useAppData();
  const today = dayKey(Date.now());

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(today);
  const [courseId, setCourseId] = useState("");
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setTitle("");
    setDay(dayKey(Date.now()));
    setCourseId("");
    setSubject("");
    setTags("");
  }, [open]);

  async function save() {
    if (!text.trim()) {
      toast("Write what you want to remember first.", "error");
      return;
    }
    if (!day || day > today) {
      toast("Pick a day that's today or earlier.", "error");
      return;
    }
    setSaving(true);
    const saved = await addMemory({
      title,
      text,
      occurredAt: day,
      courseId: courseId || null,
      subject: courseId ? null : subject,
      tags: tags.split(/[,#]/).map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (saved) {
      toast("Added to your Brain", "success");
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a memory" description="Something you learned or want to be able to find again — from any time." className="max-w-xl">
      <div className="space-y-4">
        <Field label="What do you want to remember?">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. In 3rd grade I learned multiplication with the times-tables chart and skip counting…"
            className="min-h-[120px]"
            autoFocus
          />
        </Field>

        <Field label="Title" hint="Optional — a short name makes it easier to spot.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Multiplication in elementary school" />
        </Field>

        <Field label="When was this?" hint="Any day up to today — it lands there on the timeline.">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="w-auto" />
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDay(q.day())}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                  day === q.day() ? "border-primary/50 bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" hint="Connects it to that class's cluster.">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">No class</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {!courseId && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Or a subject, e.g. Math" className="mt-2" maxLength={80} />}
          </Field>
          <Field label="Tags" hint="Comma-separated. Shared tags link memories.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="multiplication, math" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            <Brain className="h-4 w-4" />
            Add to Brain
          </Button>
        </div>
      </div>
    </Modal>
  );
}
