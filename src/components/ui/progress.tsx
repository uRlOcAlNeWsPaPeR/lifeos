import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "success" | "warning" | "ai";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bar =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "ai"
          ? "bg-gradient-ai"
          : "bg-gradient-brand";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700 ease-out", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-grad-${size}`;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--g-purple)" />
          <stop offset="60%" stopColor="var(--g-blue)" />
          <stop offset="100%" stopColor="var(--g-cyan)" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        className="stroke-white/10"
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke={`url(#${id})`}
        className="transition-all duration-700"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
      />
    </svg>
  );
}
