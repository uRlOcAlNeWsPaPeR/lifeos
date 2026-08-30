"use client";

import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-surface p-4 sm:p-5", className)} {...props} />;
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
        tone === "ok" && "border-success/30 bg-success/10 text-success",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "muted" && "border-white/10 bg-white/[0.03] text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MetricBar({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: number; // 0..1
  tone?: "primary" | "success";
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Note({
  title,
  children,
  strong,
}: {
  title: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 text-xs leading-relaxed text-muted-foreground",
        strong ? "border-white/15 bg-white/[0.03]" : "border-white/8 bg-white/[0.02]",
      )}
    >
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground/90">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        {title}
      </p>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary align-[-2px]" />
  );
}
