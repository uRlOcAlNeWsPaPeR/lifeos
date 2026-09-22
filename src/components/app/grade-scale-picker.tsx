"use client";

import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GRADE_SCALE_PRESETS,
  resolveGradeScale,
  type GradeScalePref,
  type LetterScaleEntry,
} from "@/lib/grades";

const rid = () => Math.random().toString(36).slice(2);

/**
 * Pick which percent→letter cutoffs to grade against — a handful of common
 * presets (they vary a lot school to school, country to country) plus a fully
 * custom table. Purely controlled: the caller owns saving.
 */
export function GradeScalePicker({
  value,
  onChange,
}: {
  value: GradeScalePref;
  onChange: (next: GradeScalePref) => void;
}) {
  const isCustom = value.presetId === "custom";

  return (
    <div className="space-y-2">
      {GRADE_SCALE_PRESETS.map((preset) => (
        <PresetCard
          key={preset.id}
          selected={value.presetId === preset.id}
          label={preset.label}
          example={preset.example}
          onSelect={() => onChange({ presetId: preset.id })}
        />
      ))}
      <PresetCard
        selected={isCustom}
        label="Custom"
        example="Set your own cutoffs"
        onSelect={() =>
          onChange({
            presetId: "custom",
            custom: value.custom?.length
              ? value.custom
              : resolveGradeScale(value).filter((r) => r.min > 0),
          })
        }
      />
      {isCustom && (
        <CustomTable
          rows={value.custom ?? []}
          onChange={(rows) => onChange({ presetId: "custom", custom: rows })}
        />
      )}
    </div>
  );
}

function PresetCard({
  selected,
  label,
  example,
  onSelect,
}: {
  selected: boolean;
  label: string;
  example: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/[0.08]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/15",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary bg-gradient-brand text-primary-foreground" : "border-white/20",
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{example}</span>
      </span>
    </button>
  );
}

function CustomTable({
  rows,
  onChange,
}: {
  rows: LetterScaleEntry[];
  onChange: (rows: LetterScaleEntry[]) => void;
}) {
  // Stable local ids so rows (and each row's own input state below) don't
  // get scrambled while typing. Grows/shrinks with `rows` instead of being
  // fixed at mount, so a newly-added row gets a real, stable id too — not a
  // fresh random one generated on every render.
  const [ids, setIds] = useState<string[]>(() => rows.map(() => rid()));
  useEffect(() => {
    setIds((cur) => {
      if (cur.length === rows.length) return cur;
      if (cur.length < rows.length) {
        return [...cur, ...Array.from({ length: rows.length - cur.length }, rid)];
      }
      return cur.slice(0, rows.length);
    });
  }, [rows.length]);
  const keyed = rows.map((r, i) => ({ ...r, id: ids[i] ?? `pending-${i}` }));

  const set = (i: number, patch: Partial<LetterScaleEntry>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="ml-8 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-xs font-medium text-muted-foreground">Letter · minimum percent</p>
      {keyed.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            className="h-8 w-20"
            placeholder="A"
            value={row.letter}
            onChange={(e) => set(i, { letter: e.target.value })}
          />
          <MinPercentInput value={row.min} onChange={(min) => set(i, { min })} />
          <span className="text-xs text-muted-foreground">% and up</span>
          <button
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Remove row"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange([...rows, { min: 0, letter: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add row
      </Button>
      <p className="text-[11px] text-muted-foreground/70">
        Anything below your lowest row counts as an F. Decimals are fine (89.5).
      </p>
    </div>
  );
}

/**
 * The minimum-percent field, kept as its own component so its displayed text
 * is local state rather than re-derived from the number on every keystroke.
 * Re-deriving it (`String(Number(text))`) is what silently ate a trailing
 * decimal point — typing "89." became the number 89, which re-rendered back
 * to the text "89", so the "." could never actually be finished.
 */
function MinPercentInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  return (
    <Input
      className="h-8 w-20 text-center"
      inputMode="decimal"
      placeholder="90"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const n = next.trim() === "" ? NaN : Number(next);
        if (next.trim() === "" || Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
