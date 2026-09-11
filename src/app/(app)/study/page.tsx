"use client";

import { useMemo, useState } from "react";
import { Plus, Timer, Trash2, Lock, LockOpen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { EventEditor } from "@/app/(app)/calendar/calendar-view";
import { useAppData } from "@/lib/store/app-data";
import { openStudyLockPrompt, fmtLeft } from "@/lib/study-lock";
import { fmtDate, fmtTime } from "@/lib/format";
import { todayKey } from "@/lib/firebase/schema";

export default function StudyPage() {
  const { data, addEvent, deleteEvent } = useAppData();
  const [editing, setEditing] = useState(false);
  const now = Date.now();

  const sessions = useMemo(
    () =>
      data.events
        .filter((e) => e.kind === "study_session" && e.startAt && e.endAt)
        .map((e) => ({ ...e, start: +new Date(e.startAt), end: +new Date(e.endAt) }))
        .sort((a, b) => a.start - b.start),
    [data.events],
  );
  const live = sessions.find((s) => s.start <= now && now < s.end) ?? null;
  const upcoming = sessions.filter((s) => s.start > now);

  return (
    <>
      <PageHeader
        title="Study"
        description="Schedule focus sessions and lock in when it's time. A session clears itself once it's over."
        action={
          <Button onClick={() => setEditing(true)}>
            <Plus className="h-4 w-4" /> New session
          </Button>
        }
      />

      {live && (
        <Card
          glow
          className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">In progress</Badge>
              <Badge tone={live.locked === false ? "muted" : "primary"}>
                {live.locked === false ? "Unlocked" : "Locked"}
              </Badge>
              <p className="truncate font-medium">{live.title}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtTime(live.startAt)} – {fmtTime(live.endAt)} · {fmtLeft(live.end - now)} left
            </p>
          </div>
          {live.locked !== false && (
            <Button className="shrink-0" onClick={() => openStudyLockPrompt()}>
              <Lock className="h-4 w-4" /> Lock in
            </Button>
          )}
        </Card>
      )}

      {upcoming.length === 0 && !live ? (
        <EmptyState
          icon={Timer}
          title="No study sessions"
          description="Block out time to focus. When a session is live, LifeOS nudges you to lock in."
          action={
            <Button size="sm" onClick={() => setEditing(true)}>
              <Plus className="h-4 w-4" /> New session
            </Button>
          }
        />
      ) : (
        upcoming.length > 0 && (
          <div className="space-y-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Upcoming
            </p>
            {upcoming.map((s) => (
              <Card key={s.id} className="flex items-center gap-3 p-4">
                {s.locked === false ? (
                  <LockOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.startAt, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {fmtTime(s.startAt)} – {fmtTime(s.endAt)}
                    {s.locked === false ? " · unlocked" : ""}
                  </p>
                </div>
                <button
                  onClick={() => deleteEvent(s.id)}
                  aria-label="Delete session"
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            ))}
          </div>
        )
      )}

      <EventEditor
        open={editing}
        dateKey={todayKey()}
        onClose={() => setEditing(false)}
        onSave={async (p) => {
          await addEvent({ ...p, kind: "study_session" });
          setEditing(false);
        }}
      />
    </>
  );
}
