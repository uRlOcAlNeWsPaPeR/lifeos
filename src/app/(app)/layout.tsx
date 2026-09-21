"use client";

import { Suspense, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { AppDataProvider, useAppData } from "@/lib/store/app-data";
import { AssistantChatProvider } from "@/lib/assistant-chat";
import { recordLastPage } from "@/lib/last-page";
import { Sidebar, type SectionId } from "@/components/app/sidebar";
import { DailyBrief } from "@/components/app/daily-brief";
import { CanvasAutoSync } from "@/components/canvas/canvas-auto-sync";
import { TaskReminders } from "@/components/app/task-reminders";
import { FullscreenLoader, FirebaseNotConfigured } from "@/components/app/gates";
import { UndoBar } from "@/components/ui/undo-bar";
import { CommandPalette } from "@/components/app/command-palette";
import { StudyLockPrompt } from "@/components/app/study-lock-prompt";

// Which scoped sidebar a route belongs to. Settings (and anything else not
// listed) falls through to the full-directory sidebar instead of a section.
const SECTION_ROUTES: { prefix: string; section: SectionId }[] = [
  { prefix: "/brain-dump", section: "life" },
  { prefix: "/tasks", section: "life" },
  { prefix: "/school", section: "school" },
  { prefix: "/grades", section: "school" },
  { prefix: "/practice", section: "school" },
  { prefix: "/podcast", section: "school" },
  { prefix: "/study", section: "school" },
  { prefix: "/goals", section: "progress" },
  { prefix: "/analytics", section: "progress" },
  { prefix: "/progress", section: "progress" },
];

// The Life and School sidebars both link to /calendar — Life with
// ?scope=personal, School with none — so pathname alone can't tell them
// apart the way it can for every other route.
function sectionForPath(pathname: string, scope: string | null): SectionId | undefined {
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) {
    return scope === "personal" ? "life" : "school";
  }
  return SECTION_ROUTES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  )?.section;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, initializing, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && configured && !user) router.replace("/login");
  }, [initializing, configured, user, router]);

  if (!configured) return <FirebaseNotConfigured />;
  if (initializing || !user) return <FullscreenLoader />;

  return (
    <AppDataProvider uid={user.uid} email={user.email}>
      <AssistantChatProvider>
        <Suspense fallback={<FullscreenLoader />}>
          <OnboardedShell>{children}</OnboardedShell>
        </Suspense>
      </AssistantChatProvider>
    </AppDataProvider>
  );
}

function OnboardedShell({ children }: { children: React.ReactNode }) {
  const { data, ready } = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  const scope = useSearchParams().get("scope");

  useEffect(() => {
    if (ready && !data.profile.onboarded) router.replace("/onboarding");
  }, [ready, data.profile.onboarded, router]);

  // So "Exit AI" on the Assistant screen can return to wherever the student
  // actually came from, not always the dashboard.
  useEffect(() => {
    if (ready) recordLastPage(pathname);
  }, [ready, pathname]);

  if (!ready) return <FullscreenLoader label="Loading your workspace…" />;
  if (!data.profile.onboarded) return <FullscreenLoader />;

  // The dashboard, AI Assistant and Brain Game are their own full-bleed
  // experiences — no sidebar. Every other page keeps the rail.
  if (pathname === "/dashboard" || pathname === "/assistant" || pathname === "/brain-game") {
    return (
      <>
        <main className="min-h-[100svh]">{children}</main>
        <DailyBrief />
        <CanvasAutoSync />
        <TaskReminders />
        <CommandPalette />
        <StudyLockPrompt />
        <UndoBar />
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{ name: data.profile.name, email: data.profile.email }}
        plan={data.profile.plan}
        section={sectionForPath(pathname, scope)}
      />
      <main className="flex-1 lg:h-screen lg:overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
      <DailyBrief />
      <CanvasAutoSync />
      <TaskReminders />
      <CommandPalette />
      <StudyLockPrompt />
      <UndoBar className="lg:left-[calc(16rem+1rem)]" />
    </div>
  );
}
