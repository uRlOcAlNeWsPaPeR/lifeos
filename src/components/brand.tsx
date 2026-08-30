import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-glow-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M4 7l8-4 8 4-8 4-8-4z" strokeLinejoin="round" />
          <path d="M4 12l8 4 8-4M4 17l8 4 8-4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </span>
      {showText && <span className="text-[15px]">LifeOS</span>}
    </span>
  );
}
