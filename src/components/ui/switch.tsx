"use client";

import { cn } from "@/lib/utils";

/**
 * The on/off pill switch, used everywhere a boolean setting is toggled.
 * Padding lives on the track (`px-0.5`) and the thumb slides purely via
 * `translate-x` from its normal flex position — no absolute positioning, no
 * manual top offset to keep in sync with the track height. That's what keeps
 * the thumb's travel symmetric (equal gap from both edges in both states)
 * instead of drifting past the track bounds.
 *
 * Uses `bg-primary` (a solid color, not `bg-gradient-brand`) for the checked
 * track on purpose — `bg-gradient-brand`'s background-image is currently
 * overridden elsewhere to render as nothing, which is exactly what made this
 * switch look broken (a floating dot, no visible track) in the first place.
 * `bg-primary` doesn't go through that utility at all, so the track stays
 * visible regardless.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — these switches carry no visible text of their own. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50",
        checked ? "bg-primary" : "bg-white/15",
        className,
      )}
    >
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
