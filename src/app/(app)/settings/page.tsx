"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Bell, Timer, User, GraduationCap, Plug, Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LogoutButton,
  ProfileForm,
  ScheduleSettings,
  StudySettings,
  NotificationSettings,
  GradeScaleSettings,
} from "./settings-client";
import { CanvasSettings } from "./canvas-settings";
import { GoogleCalendarSettings } from "./google-calendar-settings";
import { BrainGameLeaderboardSettings } from "./brain-game-leaderboard-settings";
import { useAppData } from "@/lib/store/app-data";
import { SCHOOL_INTEGRATIONS, CALENDAR_INTEGRATIONS } from "@/lib/integrations/descriptors";
import { IntegrationCard } from "@/components/app/integration-card";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "study", label: "Study", icon: Timer },
  { id: "school", label: "School", icon: GraduationCap },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "profile", label: "Profile", icon: User },
  // The Plan tab (billing/pricing) is hidden for now — everyone on this
  // account is comped to Student+, so showing a pricing tab with nothing to
  // actually buy was just confusing. Its render code is in git history
  // (removed alongside this) if it needs to come back.
] as const;

type TabId = (typeof TABS)[number]["id"];

const isTabId = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

/**
 * `useSearchParams` opts a route into dynamic rendering unless it sits behind a
 * Suspense boundary, so the panel is split out and wrapped below.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<PageHeader title="Settings" />}>
      <SettingsPanel />
    </Suspense>
  );
}

function SettingsPanel() {
  const { data } = useAppData();
  const router = useRouter();
  const params = useSearchParams();
  const p = data.profile;

  // The tab lives in the URL, so /settings?tab=connections opens on Connections —
  // that's where the "Connections" button on School and Calendar points — and so
  // a tab can be linked, bookmarked and reached with the back button.
  const fromUrl = params.get("tab");
  const [fallbackTab, setFallbackTab] = useState<TabId>("schedule");
  const tab: TabId = isTabId(fromUrl) ? fromUrl : fallbackTab;

  function selectTab(id: TabId) {
    setFallbackTab(id);
    router.replace(`/settings?tab=${id}`, { scroll: false });
  }

  return (
    <>
      <PageHeader title="Settings" description="Your schedule, study rhythm, notifications and account." />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-gradient-to-r from-primary/20 to-transparent text-foreground shadow-[inset_1px_0_0_hsl(var(--glow)/0.6)]"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <t.icon className={cn("h-4 w-4", tab === t.id && "text-primary")} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 max-w-2xl space-y-6">
          {tab === "schedule" && (
            <Section title="Schedule & sleep" desc="LifeOS uses this to plan work into your free time and avoid pushing tasks past your bedtime.">
              <ScheduleSettings />
            </Section>
          )}

          {tab === "study" && (
            <Section title="Study preferences">
              <StudySettings />
            </Section>
          )}

          {tab === "school" && (
            <Section
              title="Grading scale"
              desc="Pick the cutoffs your school actually uses — plenty vary from the U.S. default."
            >
              <GradeScaleSettings />
            </Section>
          )}

          {tab === "connections" && (
            <>
              <Section
                title="Canvas"
                desc="Canvas is the source of your school data. LifeOS turns it into tasks, deadlines and a workload view — it never replaces your own planning."
              >
                <CanvasSettings />
              </Section>
              <Section
                title="Google Calendar"
                desc="One-way — LifeOS reads your events. It never creates, edits or deletes anything on Google."
              >
                <GoogleCalendarSettings />
              </Section>
              <Section
                title="More integrations"
                desc="On the way — connect once they're available."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {[...SCHOOL_INTEGRATIONS, ...CALENDAR_INTEGRATIONS]
                    .filter((i) => i.status === "coming_soon")
                    .map((i) => (
                      <IntegrationCard key={i.id} integration={i} />
                    ))}
                </div>
              </Section>
            </>
          )}

          {tab === "notifications" && (
            <Section title="Notifications & alarms">
              <NotificationSettings />
            </Section>
          )}

          {tab === "leaderboard" && (
            <Section
              title="Brain Game leaderboard"
              desc="This week's Competitive score, under the name you're shown as — change it or drop off the board any time."
            >
              <BrainGameLeaderboardSettings />
            </Section>
          )}

          {tab === "profile" && (
            <>
              <Section title="Profile">
                <ProfileForm
                  defaults={{
                    name: p.name,
                    email: p.email,
                    gradeYear: p.gradeYear ?? "",
                    school: p.school ?? "",
                    goalsText: p.goalsText ?? "",
                  }}
                />
              </Section>
              <Section title="Focus areas">
                <div className="flex flex-wrap gap-2">
                  {p.helpWith.length ? (
                    p.helpWith.map((h) => (
                      <Badge key={h} tone="primary">{h}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No focus areas set.</p>
                  )}
                  {p.extracurriculars.map((x) => (
                    <Badge key={x} tone="muted">{x}</Badge>
                  ))}
                </div>
              </Section>
              <Section title="Account">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Sign out of LifeOS on this device.</p>
                  <LogoutButton />
                </div>
              </Section>
            </>
          )}

        </div>
      </div>
    </>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {desc && <p className="mt-1 mb-4 text-sm text-muted-foreground">{desc}</p>}
      <div className={desc ? "" : "mt-4"}>{children}</div>
    </Card>
  );
}
