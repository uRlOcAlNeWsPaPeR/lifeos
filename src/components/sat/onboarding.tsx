"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Flame, Rocket, Sprout, Target, TrendingUp, Dumbbell, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SingleChips } from "@/components/ui/choice-chips";
import { toast } from "@/components/ui/toaster";
import { commit } from "@/lib/sat/store";
import { suggestTargets, todayStr } from "@/lib/sat/engine";
import { PSAT_DATES, SAT_DATES } from "@/lib/sat/constants";
import { confetti } from "@/lib/sat/celebrate";
import { cn } from "@/lib/utils";

const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

type PrevType = "SAT" | "PSAT" | "none";

const STEPS = [
  { icon: User, title: "Welcome to SAT Prep", sub: "Real questions from the College Board question bank, a streak to keep you honest, and a plan built around your test date." },
  { icon: CalendarDays, title: "When are your test days?", sub: "Set one or both — you'll get a countdown and pacing for each. Either can stay blank for now." },
  { icon: TrendingUp, title: "Taken the SAT or PSAT before?", sub: "A previous score sets your starting point." },
  { icon: Target, title: "Set your target scores", sub: "Aim high — you'll see how close you're getting on each test." },
  { icon: Flame, title: "Pick your daily goal", sub: "Practice every day to build your streak." },
] as const;

const GOALS = [
  { value: 5, label: "Chill", icon: Sprout },
  { value: 10, label: "Solid", icon: Dumbbell },
  { value: 20, label: "Grind", icon: Rocket },
];

/** The first-run setup ScoreClimb asked for, before any SAT screen opens. */
export function SatOnboarding({ defaultName }: { defaultName?: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName ?? "");
  const [satDate, setSatDate] = useState("");
  const [psatDate, setPsatDate] = useState("");
  const [prevType, setPrevType] = useState<PrevType | null>(null);
  const [prevScore, setPrevScore] = useState(1000);
  const [satTarget, setSatTarget] = useState(1300);
  const [psatTarget, setPsatTarget] = useState(1210);
  const [goal, setGoal] = useState(10);

  const today = todayStr();
  const upcoming = useMemo(
    () => ({
      sat: SAT_DATES.filter((d) => d > today).slice(0, 4),
      psat: PSAT_DATES.filter((d) => d > today).slice(0, 4),
    }),
    [today],
  );

  function next() {
    if (step === 0 && !name.trim()) return toast("Tell us your name first.", "error");
    if (step === 1) {
      if (satDate && satDate <= today) return toast("Pick a future SAT date.", "error");
      if (psatDate && psatDate <= today) return toast("Pick a future PSAT date.", "error");
    }
    if (step === 2) {
      if (!prevType) return toast("Pick one — no pressure.", "error");
      const t = suggestTargets(prevType, prevType === "none" ? null : prevScore);
      setSatTarget(t.sat);
      setPsatTarget(t.psat);
    }
    setStep((s) => s + 1);
  }

  function finish() {
    const prev = prevType === "none" ? null : prevScore;
    commit((s) => {
      s.profile = {
        name: name.trim(),
        tests: {
          sat: { testDate: satDate || null, targetScore: satTarget, prevScore: prevType === "SAT" ? prev : null },
          psat: { testDate: psatDate || null, targetScore: psatTarget, prevScore: prevType === "PSAT" ? prev : null },
        },
        dailyGoal: goal,
      };
      if (!s.examHistory) s.examHistory = [];
    });
    confetti(90);
  }

  const S = STEPS[step];

  return (
    <div className="mx-auto max-w-xl py-4 sm:py-10">
      <Progress value={((step + 1) / STEPS.length) * 100} className="mb-6" />
      <Card className="p-6 sm:p-8">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <S.icon className="h-5 w-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{S.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{S.sub}</p>

        <div className="mt-6 space-y-5">
          {step === 0 && (
            <Field label="What should we call you?">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoFocus
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && next()}
              />
            </Field>
          )}

          {step === 1 && (
            <>
              <DateField label="SAT date" value={satDate} onChange={setSatDate} quick={upcoming.sat} />
              <DateField label="PSAT/NMSQT date" value={psatDate} onChange={setPsatDate} quick={upcoming.psat} />
            </>
          )}

          {step === 2 && (
            <>
              <SingleChips<PrevType>
                label="Previous test"
                value={prevType ?? ("" as PrevType)}
                onChange={(v) => {
                  setPrevType(v);
                  if (v === "PSAT" && prevScore > 1520) setPrevScore(1520);
                }}
                options={[
                  { value: "SAT", label: "SAT" },
                  { value: "PSAT", label: "PSAT / NMSQT" },
                  { value: "none", label: "Haven't taken one yet" },
                ]}
              />
              {prevType && prevType !== "none" && (
                <ScoreSlider
                  label="My score was"
                  value={prevScore}
                  onChange={setPrevScore}
                  min={400}
                  max={prevType === "PSAT" ? 1520 : 1600}
                />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <ScoreSlider label="SAT target" value={satTarget} onChange={setSatTarget} min={400} max={1600} big />
              <ScoreSlider label="PSAT target" value={psatTarget} onChange={setPsatTarget} min={320} max={1520} big />
            </>
          )}

          {step === 4 && (
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Daily goal">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={goal === g.value}
                  onClick={() => setGoal(g.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors",
                    goal === g.value
                      ? "border-primary/50 bg-primary/10"
                      : "border-white/10 hover:border-white/20",
                  )}
                >
                  <g.icon className={cn("h-5 w-5", goal === g.value ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.value} questions/day</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish}>Start practicing</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  quick,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  quick: string[];
}) {
  return (
    <Field label={label}>
      {quick.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {quick.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={value === d}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                value === d
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
              )}
            >
              {fmtDate.format(new Date(`${d}T12:00:00`))}
            </button>
          ))}
        </div>
      )}
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function ScoreSlider({
  label,
  value,
  onChange,
  min,
  max,
  big = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  big?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("font-semibold tabular-nums", big ? "text-2xl text-primary" : "text-base")}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={10}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-label={label}
        className="w-full accent-[hsl(var(--primary))]"
      />
    </div>
  );
}
