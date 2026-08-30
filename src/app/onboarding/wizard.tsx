"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, X, Moon, BellRing } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/ui/help-button";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/lib/firebase/onboarding-seed";
import { DEFAULT_PREFS } from "@/lib/firebase/schema";
import { fmt12 } from "@/lib/scheduling/sleep";
import { toast } from "@/components/ui/toaster";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HELP_OPTIONS = [
  "Beating procrastination",
  "Never missing a deadline",
  "Studying earlier for tests",
  "Balancing school and activities",
  "Bigger long-term goals",
  "Planning my week",
  "Keeping my grades up",
  "Managing stress & workload",
];

type ScheduleBlock = { day: string; label: string; start: string; end: string };

export function OnboardingWizard({ uid, defaultName }: { uid: string; defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(defaultName);
  const [gradeYear, setGradeYear] = useState("");
  const [school, setSchool] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([
    { day: "Monday", label: "", start: "8:00am", end: "3:00pm" },
  ]);
  const [extra, setExtra] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState("");
  const [helpWith, setHelpWith] = useState<string[]>([]);

  // sleep + study rhythm
  const [wakeTime, setWakeTime] = useState(DEFAULT_PREFS.wakeTime);
  const [bedtime, setBedtime] = useState(DEFAULT_PREFS.bedtime);
  const [schoolStart, setSchoolStart] = useState(DEFAULT_PREFS.schoolStart);
  const [schoolEnd, setSchoolEnd] = useState(DEFAULT_PREFS.schoolEnd);
  const [studyDays, setStudyDays] = useState<string[]>(DEFAULT_PREFS.studyDays);
  const [alarmsEnabled, setAlarmsEnabled] = useState(false);

  const steps = ["You", "Goals", "Classes", "Sleep & study", "Activities", "Focus"];
  const canNext = useMemo(() => (step === 0 ? name.trim().length > 0 : true), [step, name]);
  const last = steps.length - 1;

  async function finish() {
    setSubmitting(true);
    try {
      await completeOnboarding(uid, {
        name,
        gradeYear,
        school,
        goalsText,
        schedule: schedule.filter((b) => b.label.trim()),
        extracurriculars: extra,
        helpWith,
        prefs: {
          wakeTime,
          bedtime,
          schoolStart,
          schoolEnd,
          studyDays,
          alarmsEnabled,
        },
      });
      router.replace("/dashboard");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save your setup. Try again.", "error");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {steps.length}
        </span>
      </div>

      <div className="mt-4 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-gradient-brand" : "bg-white/10",
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="animate-fade-in" key={step}>
          {step === 0 && (
            <Step title="Let's set up LifeOS" subtitle="A few basics so your dashboard fits your life.">
              <Field label="What should we call you?">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Grade / year">
                  <Select value={gradeYear} onChange={(e) => setGradeYear(e.target.value)}>
                    <option value="">Select…</option>
                    {["9th grade", "10th grade", "11th grade", "12th grade", "College freshman", "College sophomore", "College junior", "College senior", "Other"].map(
                      (g) => (
                        <option key={g} value={g}>{g}</option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="School (optional)">
                  <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Lincoln High" />
                </Field>
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step
              title="What are you working toward?"
              subtitle="Write goals in plain language — one per line. Skip if you're not sure."
            >
              <Textarea
                autoFocus
                rows={6}
                value={goalsText}
                onChange={(e) => setGoalsText(e.target.value)}
                placeholder={"Get an A in Physics\nFinish my coding project\nPractice guitar 4 times per week"}
              />
              <p className="text-xs text-muted-foreground">
                We won&apos;t invent deadlines — you&apos;ll set those yourself.
              </p>
            </Step>
          )}

          {step === 2 && (
            <Step
              title="Your typical school day"
              subtitle="Add your classes so LifeOS knows when you're free. Skip and add them later if you want."
            >
              <div className="space-y-3">
                {schedule.map((block, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr] gap-2 rounded-xl border border-white/[0.08] p-3 sm:grid-cols-[110px_1fr_90px_90px_auto]"
                  >
                    <Select value={block.day} onChange={(e) => updateBlock(i, { day: e.target.value })}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                    <Input
                      placeholder="Class name (e.g. Physics)"
                      value={block.label}
                      onChange={(e) => updateBlock(i, { label: e.target.value })}
                    />
                    <Input placeholder="8:00am" value={block.start} onChange={(e) => updateBlock(i, { start: e.target.value })} />
                    <Input placeholder="9:00am" value={block.end} onChange={(e) => updateBlock(i, { end: e.target.value })} />
                    <Button variant="ghost" size="icon" onClick={() => setSchedule(schedule.filter((_, x) => x !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSchedule([...schedule, { day: "Monday", label: "", start: "", end: "" }])}
              >
                <Plus className="h-4 w-4" /> Add class
              </Button>
            </Step>
          )}

          {step === 3 && (
            <Step
              title="Your sleep & study rhythm"
              subtitle="LifeOS uses this to plan work into your real free time — and to stop pushing tasks past your bedtime."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Wake-up time">
                  <Input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
                </Field>
                <Field
                  label={
                    <span className="flex items-center gap-1.5">
                      Desired bedtime
                      <HelpButton>
                        <p className="font-medium text-foreground">Why does LifeOS need this?</p>
                        <p className="mt-1">
                          Your bedtime is a <em>scheduling preference</em>. LifeOS tries to avoid
                          planning normal tasks and study sessions past it, so work doesn&apos;t
                          creep into your sleep.
                        </p>
                        <p className="mt-1">
                          It never stops you working later — you can always override it on a
                          specific task.
                        </p>
                      </HelpButton>
                    </span>
                  }
                >
                  <Input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
                </Field>
                <Field label="School starts">
                  <Input type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} />
                </Field>
                <Field label="School ends">
                  <Input type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} />
                </Field>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Which days do you usually study?</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_ABBR.map((d) => {
                    const on = studyDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setStudyDays(on ? studyDays.filter((x) => x !== d) : [...studyDays, d])
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                          on
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-white/10 text-muted-foreground hover:bg-white/5",
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 text-sm">
                <span className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  Turn on alarms &amp; reminders
                  <HelpButton>
                    <p>
                      Study reminders, class reminders and a bedtime nudge. Browser notifications
                      only for now — you can fine-tune everything in Settings.
                    </p>
                  </HelpButton>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={alarmsEnabled}
                  onClick={() => setAlarmsEnabled((v) => !v)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    alarmsEnabled ? "bg-gradient-brand" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      alarmsEnabled ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>
              </label>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Moon className="h-3.5 w-3.5" />
                You&apos;re aiming for roughly{" "}
                {Math.max(0, Math.round(((24 * 60 - ((toMin(bedtime) - toMin(wakeTime) + 1440) % 1440)) / 60) * 10) / 10)}
                h of sleep ({fmt12(bedtime)} → {fmt12(wakeTime)}).
              </p>
            </Step>
          )}

          {step === 4 && (
            <Step
              title="Any extracurriculars?"
              subtitle="Sports, clubs, work, music — anything that takes regular time. Optional."
            >
              <div className="flex flex-wrap gap-2">
                {extra.map((x) => (
                  <Badge key={x} tone="primary" className="py-1">
                    {x}
                    <button onClick={() => setExtra(extra.filter((e) => e !== x))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && extraInput.trim()) {
                      e.preventDefault();
                      setExtra([...new Set([...extra, extraInput.trim()])]);
                      setExtraInput("");
                    }
                  }}
                  placeholder="e.g. Cricket practice, Debate club"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (extraInput.trim()) {
                      setExtra([...new Set([...extra, extraInput.trim()])]);
                      setExtraInput("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </Step>
          )}

          {step === 5 && (
            <Step
              title="What should LifeOS help with most?"
              subtitle="Pick a few. This tunes your AI priorities and assistant."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {HELP_OPTIONS.map((opt) => {
                  const on = helpWith.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => setHelpWith(on ? helpWith.filter((h) => h !== opt) : [...helpWith, opt])}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors",
                        on ? "border-primary bg-primary/15 text-primary" : "border-white/10 hover:bg-white/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          on ? "border-primary bg-gradient-brand text-primary-foreground" : "border-white/20",
                        )}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </Step>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {step > 0 && step < last && (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          )}
          {step < last ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} loading={submitting}>
              <Sparkles className="h-4 w-4" /> Generate my dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  function updateBlock(i: number, patch: Partial<ScheduleBlock>) {
    setSchedule((cur) => cur.map((b, x) => (x === i ? { ...b, ...patch } : b)));
  }
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
