// Centralised environment access. Firebase config is validated where it's used
// (client shows a friendly "not configured" screen; admin throws on first call).

export const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  // "gemini-3.5-flash-lite" leads on purpose, not the newer/flagship models:
  // measured live on a real key (AI Studio → Rate Limits, Sept 2026),
  // gemini-3.6-flash and gemini-3.7-flash are each capped at just 5 RPM / 20
  // RPD on the free tier — a couple of real user questions exhausts that
  // instantly. gemini-3.5-flash-lite gets 15 RPM / 500 RPD on the same
  // account — 25x the daily headroom. Published "Gemini Flash free tier"
  // numbers online (often ~1,500/day) do NOT match what a real key actually
  // gets per model version; trust AI Studio's own Rate Limits page over any
  // outside source, including this comment, if Google changes it again.
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  // Comma-separated Gemini models to try, in order, after GEMINI_MODEL — each
  // model has its own separate free-tier quota, so when the primary one hits
  // its limit this buys real headroom before ever reaching the offline engine.
  // These two are the tiny-quota ones — last resort, not first.
  GEMINI_MODEL_FALLBACKS:
    process.env.GEMINI_MODEL_FALLBACKS ?? "gemini-3.6-flash,gemini-3.7-flash",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  // No default — OpenRouter's free-model roster rotates too often to hardcode
  // a slug with any confidence, and a wrong/stale one would just silently
  // 404/error on every call. Pick current ":free" model IDs from
  // https://openrouter.ai/models?max_price=0 (the exact string shown on each
  // model's own page, e.g. "meta-llama/llama-3.1-8b-instruct:free") and set
  // this as a comma list, most-preferred first.
  OPENROUTER_MODELS: process.env.OPENROUTER_MODELS ?? "",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  AI_PROVIDER:
    (process.env.AI_PROVIDER as "auto" | "anthropic" | "gemini" | "openrouter" | "heuristic") ||
    "auto",
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "LifeOS",
};

/** GEMINI_MODEL, then GEMINI_MODEL_FALLBACKS, de-duplicated. */
export function geminiModelChain(): string[] {
  const extra = env.GEMINI_MODEL_FALLBACKS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [env.GEMINI_MODEL, ...extra].filter((m, i, arr) => arr.indexOf(m) === i);
}

/** OPENROUTER_MODELS, comma-split, de-duplicated. Empty when unconfigured. */
export function openRouterModelChain(): string[] {
  return env.OPENROUTER_MODELS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((m, i, arr) => arr.indexOf(m) === i);
}

/** This deploy's own URL, for the OpenRouter "HTTP-Referer" header. */
export function appOrigin(): string {
  return (
    env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

/**
 * Every configured hosted provider, in try-order. AI_PROVIDER picks which one
 * goes first (default: OpenRouter's free pool, then Anthropic, then Gemini);
 * whichever ones actually have an API key (and, for OpenRouter, at least one
 * configured model) are included. `getAI()` chains them — if the first one's
 * request fails (rate limit, outage, bad response) it tries the next before
 * giving up to the offline heuristic engine. OpenRouter leads by default
 * because it's the $0 layer — Gemini/Anthropic only get hit on overflow or
 * error. Set AI_PROVIDER=heuristic to force offline mode regardless of what
 * keys are present.
 */
export function resolveAiProviderChain(): ("openrouter" | "anthropic" | "gemini")[] {
  if (env.AI_PROVIDER === "heuristic") return [];
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY) && openRouterModelChain().length > 0;
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(env.GEMINI_API_KEY);
  // AI_PROVIDER only picks which PAID provider leads once OpenRouter's free
  // pool is skipped/exhausted/erroring — it never opts out of the free layer
  // itself (only AI_PROVIDER=heuristic does that, handled above).
  const paidOrder: ("anthropic" | "gemini")[] =
    env.AI_PROVIDER === "gemini" ? ["gemini", "anthropic"] : ["anthropic", "gemini"];
  const order: ("openrouter" | "anthropic" | "gemini")[] = ["openrouter", ...paidOrder];
  return order.filter((p) =>
    p === "openrouter" ? hasOpenRouter : p === "anthropic" ? hasAnthropic : hasGemini,
  );
}

/** The provider a fresh request starts with — first in the chain, else heuristic. */
export function resolveAiProvider(): "openrouter" | "anthropic" | "gemini" | "heuristic" {
  return resolveAiProviderChain()[0] ?? "heuristic";
}

export const aiEnabled = resolveAiProvider() !== "heuristic";
