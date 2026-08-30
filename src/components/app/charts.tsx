"use client";

import { cn } from "@/lib/utils";

export function BarChart({
  data,
  height = 160,
  valueKey = "value",
  className,
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  valueKey?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("flex items-end gap-2", className)} style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }}
              title={d.hint ?? `${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function GroupedBarChart({
  data,
  height = 170,
}: {
  data: { label: string; a: number; b: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end justify-center gap-1">
            <div
              className="w-1/2 rounded-t bg-primary/80"
              style={{ height: `${(d.a / max) * 100}%`, minHeight: d.a > 0 ? 3 : 0 }}
              title={`Completed: ${d.a}`}
            />
            <div
              className="w-1/2 rounded-t bg-muted-foreground/40"
              style={{ height: `${(d.b / max) * 100}%`, minHeight: d.b > 0 ? 3 : 0 }}
              title={`Created: ${d.b}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({
  value,
  label,
  size = 120,
}: {
  value: number;
  label?: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-muted" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary transition-all duration-700"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-semibold">{pct}%</span>
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
