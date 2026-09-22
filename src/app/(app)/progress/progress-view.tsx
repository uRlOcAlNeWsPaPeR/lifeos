"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Target, BarChart3 } from "lucide-react";
import { GoalsView } from "../goals/goals-view";
import { AnalyticsView } from "../analytics/analytics-view";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "goals", label: "Goals", icon: Target },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];
const isTabId = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

/**
 * "Progress" — where goals/streaks and the stats-over-time view live side by
 * side, one destination instead of two separate sidebar entries. The tab
 * lives in the URL (same pattern as /settings) so it's linkable.
 */
export function ProgressView() {
  return (
    <Suspense fallback={null}>
      <ProgressPanel />
    </Suspense>
  );
}

function ProgressPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const [fallbackTab, setFallbackTab] = useState<TabId>("goals");
  const fromUrl = params.get("tab");
  const tab: TabId = isTabId(fromUrl) ? fromUrl : fallbackTab;

  function selectTab(id: TabId) {
    setFallbackTab(id);
    router.replace(`/progress?tab=${id}`, { scroll: false });
  }

  return (
    <>
      <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              tab === t.id
                ? "bg-gradient-brand text-white shadow-glow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "goals" ? <GoalsView /> : <AnalyticsView />}
    </>
  );
}
