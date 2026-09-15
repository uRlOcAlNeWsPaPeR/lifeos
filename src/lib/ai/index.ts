import "server-only";
import { resolveAiProvider, resolveAiProviderChain } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";
import { GroqProvider } from "./groq";
import { HeuristicProvider } from "./heuristic";
import type { LLMProvider } from "./llm-base";
import type { AIProvider } from "./types";
import { limitsFor, effectivePlan, type PlanId } from "@/lib/plan-limits";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { periodKey } from "@/lib/firebase/schema";

let provider: AIProvider | null = null;
let heuristicSingleton: HeuristicProvider | null = null;

/**
 * One hosted provider per configured API key, chained in preference order —
 * Groq's free tier first (see env.ts), then OpenRouter's free pool, then
 * Gemini/Anthropic, then the offline heuristic engine. A rate limit, outage,
 * or bad response on one link retries the next before the student ever sees
 * the offline engine. With nothing configured, this collapses to
 * heuristic-only.
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
    name === "openrouter"
      ? new OpenRouterProvider()
      : name === "groq"
        ? new GroqProvider()
        : name === "anthropic"
          ? new AnthropicProvider()
          : new GeminiProvider(),
  );
  instances.forEach((p, i) => p.setFallback(instances[i + 1] ?? heuristic));

  provider = instances[0];
  return provider;
}

/**
 * The engine a request actually gets, given the student's plan. Free is $0 —
 * it never reaches a paid API, full stop, regardless of what's configured.
 * Only Student+ (and creator/comped accounts, which resolve to student_plus)
 * gets the real hosted chain.
 */
export function getAIFor(plan: PlanId): AIProvider {
  if (plan !== "student_plus") return (heuristicSingleton ??= new HeuristicProvider());
  return getAI();
}

// Student-facing labels only — deliberately generic. Which vendor/model is
// actually handling a request (OpenRouter/Gemini/Anthropic) is an internal
// routing detail, not something surfaced in the UI; only the real engine key
// still distinguishes "hosted" vs "offline" for the free-tier upsell copy.
const ENGINE_LABELS = {
  openrouter: "LifeOS AI",
  groq: "LifeOS AI",
  anthropic: "LifeOS AI",
  gemini: "LifeOS AI",
  heuristic: "LifeOS AI (offline)",
} as const;

/**
 * What to show the student. Free tier always reads as the offline engine —
 * anything else would contradict the "runs offline on Free" upsell right next
 * to it. Signed-out / plan unknown falls back to the server's configured
 * engine as a generic capability indicator.
 */
export function aiStatus(plan?: PlanId) {
  const engine = plan && plan !== "student_plus" ? "heuristic" : resolveAiProvider();
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

async function lookupPlan(uid: string) {
  const ref = adminDb().collection("users").doc(uid);
  const snap = await ref.get();
  const profile = snap.data() ?? {};
  let email = (profile.email as string) || "";
  if (!email) {
    email = (await adminAuth().getUser(uid).catch(() => null))?.email ?? "";
  }
  return { ref, profile, plan: effectivePlan(profile.plan as string, email) };
}

/** The student's effective plan — used to route a request to the right engine. */
export async function getUserPlan(uid: string): Promise<PlanId> {
  return (await lookupPlan(uid)).plan;
}

/**
 * Server-side rate limit for a metered AI feature. Reads the user's plan + email
 * (creator override), checks the current period's count against the cap,
 * increments `<feature>Usage[<periodKey>]` on the profile doc, and returns the
 * resolved plan so the caller can route to the right engine without a second read.
 */
export async function assertAndCountAiUsage(
  uid: string,
  feature: MeteredFeature,
): Promise<PlanId> {
  const cfg = FEATURE_CONFIG[feature];
  const { ref, profile, plan } = await lookupPlan(uid);
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
  return plan;
}

/** @deprecated use assertAndCountAiUsage(uid, "brainDump") */
export async function assertAndCountBrainDump(uid: string, _plan?: string) {
  void _plan;
  await assertAndCountAiUsage(uid, "brainDump");
}

export * from "./types";
export { buildContext } from "./context";
