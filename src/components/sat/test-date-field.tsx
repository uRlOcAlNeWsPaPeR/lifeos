"use client";

import { AlertCircle } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { todayStr } from "@/lib/sat/engine";
import {
  isInPsatWindow,
  isOfficialSat,
  upcomingPsat,
  upcomingSat,
  type OfficialDates,
} from "@/lib/sat/official-dates";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const nice = (d: string) => fmt.format(new Date(`${d}T12:00:00`));

/**
 * A test-date input that leads with College Board's own dates. The SAT offers
 * the official test days as one-tap chips; the PSAT/NMSQT is a window schools
 * pick a day from, so it shows the window and takes the student's exact day.
 * Any date can still be typed, and one that isn't on College Board's list gets
 * a gentle heads-up rather than being refused.
 */
export function TestDateField({
  kind,
  label,
  value,
  onChange,
  dates,
}: {
  kind: "sat" | "psat";
  label: string;
  value: string;
  onChange: (v: string) => void;
  dates: OfficialDates;
}) {
  const today = todayStr();
  const sat = upcomingSat(dates, today);
  const windows = upcomingPsat(dates, today);
  const confirmed = sat.filter((s) => !s.anticipated).slice(0, 6);
  const anticipated = sat.filter((s) => s.anticipated).slice(0, 3);

  const off =
    value !== "" &&
    (kind === "sat" ? !isOfficialSat(dates, value) : windows.length > 0 && !isInPsatWindow(dates, value));

  return (
    <Field label={label}>
      {kind === "sat" && (confirmed.length > 0 || anticipated.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {[...confirmed, ...anticipated].map((s) => (
            <button
              key={s.date}
              type="button"
              onClick={() => onChange(value === s.date ? "" : s.date)}
              aria-pressed={value === s.date}
              title={s.anticipated ? "College Board lists this as anticipated — it can still change" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                value === s.date
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                s.anticipated && "border-dashed",
              )}
            >
              {nice(s.date)}
              {s.anticipated ? " · anticipated" : ""}
            </button>
          ))}
        </div>
      )}
      {kind === "psat" && windows.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          College Board&apos;s window: {windows.map((w) => `${nice(w.start)} – ${nice(w.end)}`).join(" · ")}.
          Your school picks the day — enter yours.
        </p>
      )}
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      {off && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {kind === "sat"
            ? "That isn't a date College Board currently lists — double-check it."
            : "That's outside College Board's PSAT/NMSQT window — double-check with your school."}
        </p>
      )}
    </Field>
  );
}
