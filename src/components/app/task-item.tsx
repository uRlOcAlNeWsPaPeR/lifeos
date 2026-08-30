"use client";

import { Check, Clock, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge, priorityTone } from "@/components/ui/badge";
import { relativeDue, fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";

export function TaskItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  draggable,
  dragHandleProps,
  compact,
}: {
  task: TaskDTO;
  onToggle: (task: TaskDTO) => void;
  onEdit?: (task: TaskDTO) => void;
  onDelete?: (task: TaskDTO) => void;
  draggable?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  compact?: boolean;
}) {
  const due = relativeDue(task.dueAt);
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-card/60 backdrop-blur-xl transition-all duration-200 hover:border-white/15",
        compact ? "px-3 py-2" : "px-4 py-3.5",
        done && "opacity-55",
      )}
    >
      {draggable && (
        <button
          {...dragHandleProps}
          className="cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={() => onToggle(task)}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 active:scale-90",
          done
            ? "border-primary bg-gradient-brand text-primary-foreground shadow-glow-sm"
            : "border-white/20 hover:border-primary hover:bg-primary/10",
        )}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", compact ? "text-sm" : "text-[15px]", done && "line-through")}>
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {task.category && <span>{task.category}</span>}
          {task.course && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: task.course.color }} />
              {task.course.name}
            </span>
          )}
          {task.goal && <span>· {task.goal.title}</span>}
          {task.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDuration(task.estimatedMinutes)}
            </span>
          ) : null}
        </div>
      </div>

      {due && !done && (
        <Badge tone={due.tone} className="shrink-0">
          {due.label}
        </Badge>
      )}
      {!done && (
        <Badge tone={priorityTone(task.priority)} className="hidden shrink-0 capitalize sm:inline-flex">
          {task.priority}
        </Badge>
      )}

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
        {onEdit && (
          <button
            onClick={() => onEdit(task)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(task)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
