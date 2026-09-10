"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { AppDataProvider, useAppData } from "@/lib/store/app-data";
import { AssistantChatProvider } from "@/lib/assistant-chat";
import { Sidebar } from "@/components/app/sidebar";
import { DailyBrief } from "@/components/app/daily-brief";
import { CanvasAutoSync } from "@/components/canvas/canvas-auto-sync";
import { FullscreenLoader, FirebaseNotConfigured } from "@/components/app/gates";
import { UndoBar } from "@/components/ui/undo-bar";
import { CommandPalette } from "@/components/app/command-palette";

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
        <OnboardedShell>{children}</OnboardedShell>
      </AssistantChatProvider>
    </AppDataProvider>
  );
}

function OnboardedShell({ children }: { children: React.ReactNode }) {
  const { data, ready } = useAppData();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !data.profile.onboarded) router.replace("/onboarding");
  }, [ready, data.profile.onboarded, router]);

  if (!ready) return <FullscreenLoader label="Loading your workspace…" />;
  if (!data.profile.onboarded) return <FullscreenLoader />;

  // The dashboard is its own full-bleed experience — no sidebar, reached from
  // the hub. Every other page keeps the rail.
  if (pathname === "/dashboard") {
    return (
      <>
        <main className="min-h-[100svh]">{children}</main>
        <DailyBrief />
        <CanvasAutoSync />
        <CommandPalette />
        <UndoBar />
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{ name: data.profile.name, email: data.profile.email }}
        plan={data.profile.plan}
      />
      <main className="flex-1 lg:h-screen lg:overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
      <DailyBrief />
      <CanvasAutoSync />
      <CommandPalette />
      <UndoBar className="lg:left-[calc(16rem+1rem)]" />
    </div>
  );
}
