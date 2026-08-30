import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small, quiet marker for anything that came from Canvas. Uses the existing LifeOS
 * visual language (dark surface, primary accent) — it's an indicator, not a rebrand.
 */
export function CanvasBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary",
        className,
      )}
    >
      <CanvasGlyph className="h-2.5 w-2.5" />
      Canvas
    </span>
  );
}

/** "Open in Canvas" deep link. Renders nothing without a URL. */
export function OpenInCanvas({
  url,
  className,
  compact,
}: {
  url: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary",
        className,
      )}
      title="Open in Canvas"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {!compact && "Open in Canvas"}
    </a>
  );
}

function CanvasGlyph({ className }: { className?: string }) {
  // Simple dotted mark evoking Canvas's logo — no trademarked asset.
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="currentColor">
      <circle cx="8" cy="2.2" r="1.5" />
      <circle cx="8" cy="13.8" r="1.5" />
      <circle cx="2.2" cy="8" r="1.5" />
      <circle cx="13.8" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  );
}
