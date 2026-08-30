"use client";

import Link from "next/link";
import { Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fmtTime } from "@/lib/format";
import { useAppData } from "@/lib/store/app-data";
import { fmt12, minutesToHm, hm } from "@/lib/scheduling/sleep";
import type { EventDTO } from "@/lib/types";

const KIND_STYLE: Record<string, string> = {
  class: "bg-primary",
  study_session: "bg-[var(--g-teal)]",
  deadline: "bg-destructive",
  event: "bg-muted-foreground",
};

interface Row {
  key: string;
  label: string;
  time: string;
  dot: string;
  sub?: string;
  muted?: boolean;
}

export function TodaySchedule({
  events,
  dueTodayCount,
}: {
  events: EventDTO[];
  dueTodayCount: number;
}) {
  const { data } = useAppData();
  const prefs = data.profile.prefs;

  const rows: Row[] = events.map((e) => ({
    key: e.id,
    label: e.title,
    time: e.allDay ? "All day" : `${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`,
    sub: e.location ?? undefined,
    dot: KIND_STYLE[e.kind] ?? "bg-muted-foreground",
  }));

  // wind-down + bedtime always anchor the end of the day
  const windDown = minutesToHm(hm(prefs.bedtime) - prefs.windDownMinutes);
  rows.push(
    { key: "wind", label: "Wind down", time: fmt12(windDown), dot: "bg-primary/40", muted: true },
    { key: "bed", label: "Desired bedtime", time: fmt12(prefs.bedtime), dot: "bg-primary", muted: true },
  );

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s schedule
        </h2>
        <Link href="/calendar" className="text-xs font-medium text-primary hover:underline">
          Open
        </Link>
      </div>

      {events.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          Nothing on the calendar today.
          {dueTodayCount > 0 && ` ${dueTodayCount} task${dueTodayCount === 1 ? "" : "s"} due.`}
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-2 w-2 rounded-full ${r.dot}`} />
              {i < rows.length - 1 && <span className="mt-1 w-px flex-1 bg-white/10" />}
            </div>
            <div className="pb-1">
              <p className={r.muted ? "flex items-center gap-1.5 text-sm text-muted-foreground" : "text-sm font-medium"}>
                {r.key === "bed" && <Moon className="h-3.5 w-3.5" />}
                {r.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.time}
                {r.sub ? ` · ${r.sub}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
