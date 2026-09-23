"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useAppData } from "@/lib/store/app-data";
import { useSat } from "@/lib/sat/store";
import { Sidebar } from "@/components/app/sidebar";
import { SatOnboarding } from "@/components/sat/onboarding";
import { LoadingBlock } from "@/components/sat/common";

/**
 * SAT Prep lives inside the normal LifeOS shell, but as its own app entered
 * from the Core's blue sphere — it gets a full-bleed page (no persistent
 * sidebar rail; see the `/sat` case in `(app)/layout.tsx`) with its own menu
 * button opening the same Sidebar as a drawer, closed by default, instead of
 * the sidebar sitting open the whole time. It also holds every SAT screen
 * behind the one-time setup (name, test dates, targets, daily goal), which
 * ScoreClimb also required first.
 */
export default function SatLayout({ children }: { children: React.ReactNode }) {
  const { s, ready } = useSat();
  const { data } = useAppData();
  const [menu, setMenu] = useState(false);

  if (!ready) return <LoadingBlock label="Loading SAT Prep…" />;
  if (!s.profile) return <SatOnboarding defaultName={data.profile.name.split(" ")[0] || undefined} />;

  return (
    <div className="min-h-[100svh]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-background/70 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
        <button
          onClick={() => setMenu(true)}
          aria-label="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tracking-tight">SAT Prep</span>
      </div>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">{children}</div>
      <Sidebar
        open={menu}
        onOpenChange={setMenu}
        user={{ name: data.profile.name, email: data.profile.email }}
        plan={data.profile.plan}
      />
    </div>
  );
}
