import "server-only";
import { resolveAiProvider, resolveAiProviderChain } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { HeuristicProvider } from "./heuristic";
import type { LLMProvider } from "./llm-base";
import type { AIProvider } from "./types";
import { limitsFor, effectivePlan } from "@/lib/plan-limits";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { periodKey } from "@/lib/firebase/schema";

let provider: AIProvider | null = null;

/**
 * One hosted provider per configured API key, chained in preference order —
 * e.g. Gemini fails or hits a rate limit → the same request retries against
 * Anthropic before ever falling back to the offline heuristic engine. With
 * only one key configured, or none, this collapses to the old single-provider
 * (or heuristic-only) behaviour.
 */
export function getAI(): AIProvider {
  if (provider) return provider;

  const chain = resolveAiProviderChain();
  const heuristic = new HeuristicProvider();
  if (chain.length === 0) {
    provider = heuristic;
    return provider;
  }

  const instances: LLMProvider[] = chain.map((name) =>
    name === "anthropic" ? new AnthropicProvider() : new GeminiProvider(),
  );
  instances.forEach((p, i) => p.setFallback(instances[i + 1] ?? heuristic));

  provider = instances[0];
  return provider;
}

const ENGINE_LABELS = {
  anthropic: "Claude",
  gemini: "Gemini",
  heuristic: "LifeOS heuristic engine",
} as const;

export function aiStatus() {
  const engine = resolveAiProvider();
  return { engine, label: ENGINE_LABELS[engine], smart: engine !== "heuristic" };
}

export { PLAN_LIMITS, limitsFor, effectivePlan, type PlanId } from "@/lib/plan-limits";

type MeteredFeature = "brainDump" | "assistant";

const FEATURE_CONFIG: Record<
  MeteredFeature,
  {
    usageField: string;
    period: "day" | "week";
    cap: (l: ReturnType<typeof limitsFor>) => number;
    noun: string;
  }
> = {
  brainDump: {
    usageField: "brainDumpUsage",
    period: "week",
    cap: (l) => l.brainDumpsPerWeek,
    noun: "Brain Dump",
  },
  assistant: {
    usageField: "assistantUsage",
    period: "day",
    cap: (l) => l.assistantPerDay,
    noun: "AI Assistant question",
  },
};

/**
 * Server-side rate limit for a metered AI feature. Reads the user's plan + email
 * (creator override), checks the current period's count against the cap and
 * increments `<feature>Usage[<periodKey>]` on the profile doc.
 */
export async function assertAndCountAiUsage(uid: string, feature: MeteredFeature) {
  const cfg = FEATURE_CONFIG[feature];
  const ref = adminDb().collection("users").doc(uid);
  const snap = await ref.get();
  const profile = snap.data() ?? {};
  let email = (profile.email as string) || "";
  if (!email) {
    email = (await adminAuth().getUser(uid).catch(() => null))?.email ?? "";
  }
  const plan = effectivePlan(profile.plan as string, email);
  const cap = cfg.cap(limitsFor(plan));

  const usage: Record<string, number> = (profile[cfg.usageField] as Record<string, number>) ?? {};
  const key = periodKey(cfg.period);
  const used = usage[key] ?? 0;
  const window = cfg.period === "week" ? "this week" : "today";

  if (Number.isFinite(cap) && used >= cap) {
    const err = new Error(
      `You've used your ${cap} ${cfg.noun}${cap === 1 ? "" : "s"} for ${window}.`,
    );
    (err as { status?: number }).status = 402;
    throw err;
  }
  await ref.set({ [cfg.usageField]: { [key]: used + 1 } }, { merge: true });
}

/** @deprecated use assertAndCountAiUsage(uid, "brainDump") */
export async function assertAndCountBrainDump(uid: string, _plan?: string) {
  void _plan;
  await assertAndCountAiUsage(uid, "brainDump");
}

export * from "./types";
export { buildContext } from "./context";
