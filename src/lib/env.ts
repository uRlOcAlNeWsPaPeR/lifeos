// Centralised environment access. Firebase config is validated where it's used
// (client shows a friendly "not configured" screen; admin throws on first call).

export const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-flash-latest",
  AI_PROVIDER: (process.env.AI_PROVIDER as "auto" | "anthropic" | "gemini" | "heuristic") || "auto",
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "LifeOS",
};

/**
 * Every configured hosted provider, in try-order. AI_PROVIDER picks which one
 * goes first (default: Anthropic, then Gemini); whichever ones actually have an
 * API key are included. `getAI()` chains them — if the first one's request
 * fails (rate limit, outage, bad response) it tries the next before giving up
 * to the offline heuristic engine. Set AI_PROVIDER=heuristic to force offline
 * mode regardless of what keys are present.
 */
export function resolveAiProviderChain(): ("anthropic" | "gemini")[] {
  if (env.AI_PROVIDER === "heuristic") return [];
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(env.GEMINI_API_KEY);
  const order: ("anthropic" | "gemini")[] =
    env.AI_PROVIDER === "gemini" ? ["gemini", "anthropic"] : ["anthropic", "gemini"];
  return order.filter((p) => (p === "anthropic" ? hasAnthropic : hasGemini));
}

/** The provider a fresh request starts with — first in the chain, else heuristic. */
export function resolveAiProvider(): "anthropic" | "gemini" | "heuristic" {
  return resolveAiProviderChain()[0] ?? "heuristic";
}

export const aiEnabled = resolveAiProvider() !== "heuristic";
