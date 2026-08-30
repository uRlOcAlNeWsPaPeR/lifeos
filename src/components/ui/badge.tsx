import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "ai" | "success" | "warning" | "destructive" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-white/[0.06] text-secondary-foreground ring-1 ring-inset ring-white/10",
  primary: "bg-primary/15 text-accent-foreground ring-1 ring-inset ring-primary/25",
  ai: "bg-gradient-ai text-white",
  success: "bg-success/15 text-success ring-1 ring-inset ring-success/25",
  warning: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/25",
  destructive: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25",
  muted: "bg-white/[0.04] text-muted-foreground ring-1 ring-inset ring-white/[0.06]",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function priorityTone(p: string): Tone {
  return p === "urgent"
    ? "destructive"
    : p === "high"
      ? "warning"
      : p === "low"
        ? "muted"
        : "primary";
}
