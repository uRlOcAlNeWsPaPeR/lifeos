import { Badge } from "@/components/ui/badge";
import { relativeDue, fmtDate } from "@/lib/format";
import { GraduationCap, ListChecks } from "lucide-react";

export function DeadlineList({
  items,
}: {
  items: {
    id: string;
    title: string;
    dueAt: string;
    kind: "task" | "assignment";
    color?: string | null;
    context?: string;
  }[];
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
        return (
          <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.context ? `${item.context} · ` : ""}
                {fmtDate(item.dueAt, { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
            {due && <Badge tone={due.tone}>{due.label}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
