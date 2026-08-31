"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { AppDataProvider, useAppData } from "@/lib/store/app-data";
import { Sidebar } from "@/components/app/sidebar";
import { DailyBrief } from "@/components/app/daily-brief";
import { CanvasSyncNudge } from "@/components/canvas/canvas-sync-nudge";
import { FullscreenLoader, FirebaseNotConfigured } from "@/components/app/gates";
import { UndoBar } from "@/components/ui/undo-bar";

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
      <OnboardedShell>{children}</OnboardedShell>
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
        <main className="min-h-screen">{children}</main>
        {pathname === "/dashboard" && (
          <>
            <DailyBrief />
            <CanvasSyncNudge />
          </>
        )}
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
      <CanvasSyncNudge />
      <UndoBar className="lg:left-[calc(16rem+1rem)]" />
    </div>
  );
}
