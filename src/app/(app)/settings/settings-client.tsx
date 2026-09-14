"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { HelpButton } from "@/components/ui/help-button";
import { GradeScalePicker } from "@/components/app/grade-scale-picker";
import { useAppData } from "@/lib/store/app-data";
import { useAuth } from "@/lib/firebase/auth-context";
import { fmt12 } from "@/lib/scheduling/sleep";
import type { Prefs } from "@/lib/firebase/schema";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------------------------------- profile --------------------------------- */

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; email: string; gradeYear: string; school: string; goalsText: string };
}) {
  const { patchProfile } = useAppData();
  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      patchProfile({
        name: form.name.trim(),
        gradeYear: form.gradeYear || null,
        school: form.school || null,
        goalsText: form.goalsText || null,
      });
      toast("Profile saved", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={form.email} disabled />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Grade / year">
          <Input value={form.gradeYear} onChange={(e) => setForm({ ...form, gradeYear: e.target.value })} />
        </Field>
        <Field label="School">
          <Input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
        </Field>
      </div>
      <Field label="Main goals" hint="Used to tune AI priorities and the assistant.">
        <Textarea
          rows={3}
          value={form.goalsText}
          onChange={(e) => setForm({ ...form, goalsText: e.target.value })}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------- schedule / sleep ----------------------------- */

function sleepHours(bedtime: string, wake: string) {
  const to = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const mins = (to(wake) - to(bedtime) + 1440) % 1440;
  return Math.round((mins / 60) * 10) / 10;
}

export function ScheduleSettings() {
  const { data, updatePrefs } = useAppData();
  const [p, setP] = useState<Prefs>(data.profile.prefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => setP(data.profile.prefs), [data.profile.prefs]);

  const dirty = JSON.stringify(p) !== JSON.stringify(data.profile.prefs);

  async function save() {
    setSaving(true);
    await updatePrefs(p);
    setSaving(false);
    toast("Schedule saved", "success");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Wake-up time">
          <Input type="time" value={p.wakeTime} onChange={(e) => setP({ ...p, wakeTime: e.target.value })} />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-1.5">
              Desired bedtime
              <HelpButton>
                <p className="font-medium text-foreground">Why does LifeOS need this?</p>
                <p className="mt-1">
                  Your bedtime is a <em>scheduling preference</em>. LifeOS tries not to plan normal
                  tasks or study sessions past it.
                </p>
                <p className="mt-1">
                  This does <strong>not</strong> stop you working later — you can override it on any
                  task when you create it.
                </p>
              </HelpButton>
            </span>
          }
        >
          <Input type="time" value={p.bedtime} onChange={(e) => setP({ ...p, bedtime: e.target.value })} />
        </Field>
        <Field label="School starts">
          <Input type="time" value={p.schoolStart} onChange={(e) => setP({ ...p, schoolStart: e.target.value })} />
        </Field>
        <Field label="School ends">
          <Input type="time" value={p.schoolEnd} onChange={(e) => setP({ ...p, schoolEnd: e.target.value })} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Study days</p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_ABBR.map((d) => {
            const on = p.studyDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setP({ ...p, studyDays: on ? p.studyDays.filter((x) => x !== d) : [...p.studyDays, d] })
                }
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  on ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Moon className="h-3.5 w-3.5" />
        ~{sleepHours(p.bedtime, p.wakeTime)}h of sleep ({fmt12(p.bedtime)} → {fmt12(p.wakeTime)})
      </p>

      {dirty && (
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            Save schedule
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- study prefs ------------------------------ */

export function StudySettings() {
  const { data, updatePrefs } = useAppData();
  const [p, setP] = useState<Prefs>(data.profile.prefs);
  useEffect(() => setP(data.profile.prefs), [data.profile.prefs]);
  const dirty = JSON.stringify(p) !== JSON.stringify(data.profile.prefs);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default study session" hint="Used by Focus Mode & Plan My Day">
          <Select
            value={String(p.defaultSessionMin)}
            onChange={(e) => setP({ ...p, defaultSessionMin: Number(e.target.value) })}
          >
            {[25, 30, 45, 50, 60, 90].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </Select>
        </Field>
        <Field label="Default break">
          <Select
            value={String(p.defaultBreakMin)}
            onChange={(e) => setP({ ...p, defaultBreakMin: Number(e.target.value) })}
          >
            {[5, 10, 15, 20].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </Select>
        </Field>
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              await updatePrefs(p);
              toast("Study preferences saved", "success");
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- notifications ---------------------------- */

export function NotificationSettings() {
  const { data, updatePrefs } = useAppData();
  const [p, setP] = useState<Prefs>(data.profile.prefs);
  useEffect(() => setP(data.profile.prefs), [data.profile.prefs]);
  const r = p.reminders;
  const dirty = JSON.stringify(p) !== JSON.stringify(data.profile.prefs);

  const setR = (patch: Partial<Prefs["reminders"]>) => setP({ ...p, reminders: { ...r, ...patch } });

  return (
    <div className="space-y-4">
      <Toggle
        icon={BellRing}
        label="Alarms & reminders"
        help="Study reminders, class reminders and a bedtime nudge. Browser notifications only for now."
        checked={p.alarmsEnabled}
        onChange={(v) => setP({ ...p, alarmsEnabled: v })}
      />
      <Toggle
        label="Reminders enabled"
        checked={r.enabled}
        onChange={(v) => setR({ enabled: v })}
      />
      <div className="grid gap-4 sm:grid-cols-3 pl-1">
        <Field label="Remind me">
          <Select value={String(r.leadMinutes)} onChange={(e) => setR({ leadMinutes: Number(e.target.value) })}>
            {[10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>{m} min before</option>
            ))}
          </Select>
        </Field>
        <Field label="Quiet hours start">
          <Input type="time" value={r.quietStart} onChange={(e) => setR({ quietStart: e.target.value })} />
        </Field>
        <Field label="Quiet hours end">
          <Input type="time" value={r.quietEnd} onChange={(e) => setR({ quietEnd: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-2 pl-1 sm:grid-cols-3">
        <Toggle small label="Task reminders" checked={r.taskReminders} onChange={(v) => setR({ taskReminders: v })} />
        <Toggle small label="Calendar reminders" checked={r.calendarReminders} onChange={(v) => setR({ calendarReminders: v })} />
        <Toggle small label="Study reminders" checked={r.studyReminders} onChange={(v) => setR({ studyReminders: v })} />
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              await updatePrefs(p);
              toast("Notification settings saved", "success");
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ grading scale ------------------------------ */

export function GradeScaleSettings() {
  const { data, updatePrefs } = useAppData();
  const [p, setP] = useState<Prefs>(data.profile.prefs);
  const [saving, setSaving] = useState(false);
  useEffect(() => setP(data.profile.prefs), [data.profile.prefs]);
  const dirty = JSON.stringify(p.gradeScale) !== JSON.stringify(data.profile.prefs.gradeScale);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        How LifeOS turns a percent into a letter — courses that don&apos;t give you a
        percent (or already give you their own letter/grade from Canvas) aren&apos;t
        affected.
      </p>
      <GradeScalePicker value={p.gradeScale} onChange={(gradeScale) => setP({ ...p, gradeScale })} />
      {dirty && (
        <div className="flex justify-end">
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              await updatePrefs({ gradeScale: p.gradeScale });
              setSaving(false);
              toast("Grading scale saved", "success");
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  help,
  checked,
  onChange,
  small,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
}) {
  // A plain <div>, not <label> — this row can hold two interactive buttons
  // (the Help popover and the switch itself), and a <label> forwards clicks
  // to whichever labelable descendant the browser picks, which made the
  // switch fire from clicks meant for Help (and vice versa). The switch is
  // accessible on its own via role="switch" + aria-checked + aria-label.
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] text-sm",
        small ? "p-2.5" : "p-3.5",
      )}
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {label}
        {help && <HelpButton>{help}</HelpButton>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-gradient-brand" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* --------------------------------- logout -------------------------------- */

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await logout();
        router.replace("/login");
      }}
    >
      Log out
    </Button>
  );
}
