"use client";

import { useAppData } from "@/lib/store/app-data";
import { useSat } from "@/lib/sat/store";
import { SatOnboarding } from "@/components/sat/onboarding";
import { SatTopBar } from "@/components/sat/sat-nav";
import { LoadingBlock } from "@/components/sat/common";

/**
 * SAT Prep is its own app, entered from the Core's sphere — so it gets a
 * full-bleed page (no LifeOS sidebar; see the `/sat` case in
 * `(app)/layout.tsx`) and no menu button. Moving between apps happens at the
 * Core, and SAT's own sections sit in the open in its top bar.
 *
 * This also holds every SAT screen behind the one-time setup (name, test
 * dates, targets, daily goal), which ScoreClimb also required first.
 */
export default function SatLayout({ children }: { children: React.ReactNode }) {
  const { s, ready } = useSat();
  const { data } = useAppData();

  if (!ready) return <LoadingBlock label="Loading SAT Prep…" />;
  if (!s.profile) return <SatOnboarding defaultName={data.profile.name.split(" ")[0] || undefined} />;

  return (
    <div className="min-h-[100svh]">
      <SatTopBar />
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">{children}</div>
    </div>
  );
}
