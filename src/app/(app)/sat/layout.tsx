"use client";

import { useAppData } from "@/lib/store/app-data";
import { useSat } from "@/lib/sat/store";
import { SatOnboarding } from "@/components/sat/onboarding";
import { LoadingBlock } from "@/components/sat/common";

/**
 * SAT Prep lives inside the normal LifeOS shell — this layout adds no chrome of
 * its own. It only holds every SAT screen behind the one-time setup (name, test
 * dates, targets, daily goal), which ScoreClimb also required first.
 */
export default function SatLayout({ children }: { children: React.ReactNode }) {
  const { s, ready } = useSat();
  const { data } = useAppData();

  if (!ready) return <LoadingBlock label="Loading SAT Prep…" />;
  if (!s.profile) return <SatOnboarding defaultName={data.profile.name.split(" ")[0] || undefined} />;
  return <>{children}</>;
}
