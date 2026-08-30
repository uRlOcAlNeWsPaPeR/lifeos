"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart, GroupedBarChart, Donut } from "@/components/app/charts";
import { CheckCircle2, AlertTriangle, Target, Flame, Lock, ArrowRight } from "lucide-react";
import { useAppData } from "@/lib/store/app-data";

export default function AnalyticsPage() {
  const { analytics: a, data } = useAppData();
  const full = data.limits.fullAnalytics;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your week is going — completion, workload and goal progress."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CheckCircle2} label="Completed tasks" value={a.completedTotal} sub={`${a.completed7d} in the last 7 days`} />
        <Stat
          icon={AlertTriangle}
          label="Tasks overdue"
          value={a.overdueOpen}
          sub={`${a.openTotal} open total`}
          tone={a.overdueOpen > 0 ? "warning" : "default"}
        />
        <Stat icon={Target} label="Avg goal progress" value={`${a.avgGoalProgress}%`} sub={`${a.activeGoals} active goals`} />
        <Stat icon={Flame} label="Completion streak" value={`${a.streakDays}d`} sub="days with a task done" />
      </div>

      {!full ? (
        <Card className="mt-6 flex flex-col items-center gap-3 border-primary/30 bg-primary/[0.05] p-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">That&apos;s your this-week snapshot</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Student+ unlocks your 6-week completion history, 30-day completion rate,
              7-day workload forecast and a breakdown of where your open work sits.
            </p>
          </div>
          <Link
            href="/settings"
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow-sm"
          >
            See plans <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Weekly productivity
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Tasks completed vs. created, last 6 weeks</p>
              <GroupedBarChart data={a.weeklyCompletion.map((w) => ({ label: w.label, a: w.completed, b: w.created }))} />
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary/80" /> Completed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Created
                </span>
              </div>
            </Card>

            <Card className="flex flex-col items-center justify-center p-6">
              <h2 className="mb-4 self-start text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                30-day completion rate
              </h2>
              <Donut value={a.completionRate} label="of tasks" size={150} />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Share of tasks from the last 30 days that are done.
              </p>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming workload
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Estimated minutes of due work, next 7 days</p>
              <BarChart
                data={a.upcomingWorkload.map((d) => ({
                  label: d.label,
                  value: d.minutes,
                  hint: `${d.date}: ${d.tasks} tasks, ${d.assignments} assignments (~${Math.round(d.minutes / 60)}h)`,
                }))}
              />
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {a.upcomingWorkload
                  .filter((d) => d.tasks + d.assignments > 0)
                  .slice(0, 3)
                  .map((d) => (
                    <div key={d.date} className="flex justify-between">
                      <span>
                        {d.label} {d.date}
                      </span>
                      <span>
                        {d.tasks} tasks · {d.assignments} assignments
                      </span>
                    </div>
                  ))}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Where your open work sits
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Open tasks by subject / category</p>
              {a.categoryLoad.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No open tasks.</p>
              ) : (
                <div className="space-y-4">
                  {a.categoryLoad.map((c) => {
                    const max = Math.max(...a.categoryLoad.map((x) => x.open));
                    return (
                      <div key={c.category}>
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span>{c.category}</span>
                          <span className="text-muted-foreground">
                            {c.open} {c.open === 1 ? "task" : "tasks"}
                            {c.minutes ? ` · ~${Math.round(c.minutes / 60)}h` : ""}
                          </span>
                        </div>
                        <Progress value={(c.open / max) * 100} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={
            tone === "warning"
              ? "flex h-9 w-9 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning"
              : "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
