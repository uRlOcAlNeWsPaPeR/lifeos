"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_TIERS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function PricingTable({
  currentPlan,
  mode = "marketing",
  onUpgraded,
}: {
  currentPlan?: string;
  mode?: "marketing" | "app";
  onUpgraded?: (plan: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(planId: string) {
    if (mode === "marketing") {
      router.push("/signup");
      return;
    }
    setBusy(planId);
    onUpgraded?.(planId);
    setBusy(null);
    const { toast } = await import("@/components/ui/toaster");
    toast(
      planId === "free"
        ? "You're on the Free plan."
        : "Plan updated (demo mode — no payment was taken).",
      "success",
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLAN_TIERS.map((tier) => {
        const isCurrent = currentPlan === tier.id;
        return (
          <div
            key={tier.id}
            className={cn(
              "card-surface relative flex flex-col p-6",
              tier.featured && "border-primary shadow-lg ring-1 ring-primary/20",
            )}
          >
            {tier.featured && (
              <Badge tone="primary" className="absolute -top-3 left-6">
                Most popular
              </Badge>
            )}
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              {isCurrent && <Badge tone="success">Current</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
              <span className="pb-1 text-sm text-muted-foreground">{tier.cadence}</span>
            </div>
            <Button
              className="mt-5"
              variant={tier.featured ? "primary" : "outline"}
              disabled={isCurrent}
              loading={busy === tier.id}
              onClick={() => choose(tier.id)}
            >
              {isCurrent ? "Your plan" : mode === "app" ? tier.cta : tier.cta}
            </Button>
            {mode === "app" && tier.id !== "free" && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Demo — no payment is taken
              </p>
            )}
            <ul className="mt-6 space-y-2.5 text-sm">
              {tier.features.map((f) =>
                f.endsWith(":") ? (
                  <li key={f} className="pt-1 text-xs font-semibold uppercase tracking-wide text-foreground/80">
                    {f.replace(/:$/, "")}
                  </li>
                ) : (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
