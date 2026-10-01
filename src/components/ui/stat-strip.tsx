import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One glass surface holding several stats, split by hairline dividers —
 * instead of a separate card per number. Pass the grid columns via
 * `className` (e.g. "grid-cols-3", "grid-cols-2 xl:grid-cols-4").
 *
 * Dividers come from each cell's own top/left border; the grid is pulled
 * up/left by 1px so the outer edge's borders hide under the card's clip.
 * That keeps them right however the grid wraps at each breakpoint.
 */
export function StatStrip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className={cn("-ml-px -mt-px grid", className)}>{children}</div>
    </div>
  );
}

export function StatItem({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  compact,
  className,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label?: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warning";
  /** Smaller type and padding on phones — for strips that stay one row there. */
  compact?: boolean;
  className?: string;
  /** Custom content in place of label/value/sub (e.g. a stat with its own controls). */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-l border-t border-white/[0.06]",
        compact ? "p-3 sm:p-5" : "p-5",
        className,
      )}
    >
      {children ?? (
        <>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {Icon && (
              <Icon
                className={cn("h-3.5 w-3.5 shrink-0", tone === "warning" ? "text-warning" : "text-primary")}
              />
            )}
            <span className={cn("truncate", compact ? "text-xs sm:text-sm" : "text-sm")}>{label}</span>
          </div>
          <p
            className={cn(
              "font-semibold tracking-tight",
              compact ? "mt-1.5 text-xl sm:mt-2.5 sm:text-3xl" : "mt-2.5 text-3xl",
              tone === "warning" && "text-warning",
            )}
          >
            {value}
          </p>
          {sub && (
            <p className={cn("mt-1 text-xs text-muted-foreground", compact && "hidden sm:block")}>{sub}</p>
          )}
        </>
      )}
    </div>
  );
}
