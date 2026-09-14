import { Badge } from "@/components/ui/badge";
import { relativeDue, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GraduationCap, ListChecks } from "lucide-react";

export interface DeadlineItem {
  id: string;
  title: string;
  dueAt: string;
  kind: "task" | "assignment";
  color?: string | null;
  context?: string;
}

export function DeadlineList({
  items,
  onSelect,
}: {
  items: DeadlineItem[];
  /** Opens the item's own detail view. Rows are plain text without this. */
  onSelect?: (item: DeadlineItem) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No upcoming deadlines. You&apos;re clear.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const due = relativeDue(item.dueAt);
        const Icon = item.kind === "assignment" ? GraduationCap : ListChecks;
        const content = (
          <>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", due && !due.past ? "font-semibold" : "font-medium")}>
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.context ? `${item.context} · ` : ""}
                {fmtDate(item.dueAt, { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
            {due && <Badge tone={due.tone}>{due.label}</Badge>}
          </>
        );
        return (
          <li key={`${item.kind}-${item.id}`} className={cn(due?.past && "opacity-60")}>
            {onSelect ? (
              <button
                onClick={() => onSelect(item)}
                className="-mx-1 flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
