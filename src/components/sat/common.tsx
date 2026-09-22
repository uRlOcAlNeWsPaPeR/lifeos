"use client";

import {
  AlertTriangle, Award, Bot, Crown, Dumbbell, Flag, Flame, Loader2, PenLine,
  RefreshCw, Sprout, Target, Trophy, Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSat } from "@/lib/sat/store";
import { liveStreak, type DomainRow } from "@/lib/sat/engine";
import { cn } from "@/lib/utils";

/** Streak and XP — shown on every SAT screen, as ScoreClimb's top bar did. */
export function SatStatus() {
  const { s, ready } = useSat();
  if (!ready || !s.profile) return null;
  return (
    <div className="flex items-center gap-2" aria-label="Your SAT progress">
      <Badge tone="warning" className="px-2.5 py-1" title="Daily streak">
        <Flame className="h-3.5 w-3.5" />
        {liveStreak(s)} day{liveStreak(s) === 1 ? "" : "s"}
      </Badge>
      <Badge tone="primary" className="px-2.5 py-1" title="Total XP">
        <Zap className="h-3.5 w-3.5" />
        {s.xp.toLocaleString()} XP
      </Badge>
    </div>
  );
}

/** Page header for SAT screens: LifeOS's header, with streak and XP beside it. */
export function SatHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SatStatus />
          {action}
        </div>
      }
    />
  );
}

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/30 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Accuracy rows — domains or skills — with focus/strength labels. */
export function AccuracyRows({
  rows,
}: {
  rows: { key: string; label: string; acc: number | null; att: number; tag?: DomainRow["tag"] }[];
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{r.label}</span>
              {r.tag === "weak" && <Badge tone="warning">Focus area</Badge>}
              {r.tag === "strong" && <Badge tone="success">Strength</Badge>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.acc === null ? "—" : `${r.acc}%`}
              {r.att > 0 && <span className="ml-1.5 text-xs">({r.att})</span>}
            </span>
          </div>
          <Progress value={r.acc ?? 0} tone={r.tag === "weak" ? "warning" : r.tag === "strong" ? "success" : "primary"} />
        </li>
      ))}
    </ul>
  );
}

const BADGE_ICONS: Record<string, typeof Award> = {
  first: Sprout,
  streak3: Flame,
  streak7: Zap,
  streak30: Crown,
  sharp: Target,
  century: Award,
  mathwhiz: Bot,
  wordsmith: PenLine,
  hardcore: Dumbbell,
  marathon: Flag,
};

export function BadgeIcon({ id, className }: { id: string; className?: string }) {
  const Icon = BADGE_ICONS[id] ?? Trophy;
  return <Icon className={className} />;
}

/** A labelled stat — number on top, caption below. */
export function Stat({ value, label, className }: { value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
