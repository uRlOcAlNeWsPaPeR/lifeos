"use client";

import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

const chip = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-ring",
    on
      ? "border-primary/50 bg-primary/10 text-foreground"
      : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
  );

/** A row of mutually exclusive choices. */
export function SingleChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={chip(value === o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pick any number of options. An empty selection means "all", shown by the
 * leading "all" chip — picking it clears the rest, and clearing the last pick
 * falls back to it.
 */
export function MultiChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  label,
  className,
}: {
  options: ChipOption<T>[];
  value: T[];
  onChange: (v: T[]) => void;
  allLabel: React.ReactNode;
  label: string;
  className?: string;
}) {
  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className={chip(!value.length)}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value.includes(o.value)}
          onClick={() => toggle(o.value)}
          className={chip(value.includes(o.value))}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
