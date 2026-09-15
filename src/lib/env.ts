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
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
  // Unlike OpenRouter's roster, Groq's free tier is a real, documented,
  // no-credit-card allowance per model (see console.groq.com/docs/models for
  // the current list and their individual RPM/RPD/TPM caps) — but exact
  // model names still get renamed/deprecated over time, so no default here
  // either. Comma list, most-preferred first.
  GROQ_MODELS: process.env.GROQ_MODELS ?? "",
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

/** GROQ_MODELS, comma-split, de-duplicated. Empty when unconfigured. */
export function groqModelChain(): string[] {
  return env.GROQ_MODELS.split(",")
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
 * Every configured hosted provider, in try-order: Groq's free tier first,
 * then OpenRouter's free pool, then Gemini/Anthropic (order between those
 * two picked by AI_PROVIDER), then — handled by the caller — the offline
 * heuristic engine. Whichever ones actually have an API key (and, for
 * Groq/OpenRouter, at least one configured model) are included; the rest are
 * skipped, not retried as empty links. `getAI()` chains them — if the first
 * one's request fails (rate limit, outage, bad response) it tries the next
 * before giving up to the offline engine. The two free layers lead
 * unconditionally — Gemini/Anthropic only get hit on overflow or error. Set
 * AI_PROVIDER=heuristic to force offline mode regardless of what keys are
 * present.
 */
export function resolveAiProviderChain(): ("openrouter" | "groq" | "anthropic" | "gemini")[] {
  if (env.AI_PROVIDER === "heuristic") return [];
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY) && openRouterModelChain().length > 0;
  const hasGroq = Boolean(env.GROQ_API_KEY) && groqModelChain().length > 0;
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(env.GEMINI_API_KEY);
  // AI_PROVIDER only picks which PAID provider leads once both free pools are
  // skipped/exhausted/erroring — it never opts out of the free layer itself
  // (only AI_PROVIDER=heuristic does that, handled above).
  const paidOrder: ("anthropic" | "gemini")[] =
    env.AI_PROVIDER === "gemini" ? ["gemini", "anthropic"] : ["anthropic", "gemini"];
  // Groq leads OpenRouter — measured live (2026-09-15) on the app's real
  // system prompt: faster (1.8-1.9s vs. 10-11s), better instruction
  // following, and Groq's per-model daily quota (each of 3 configured models
  // gets its own separate ~1K/day bucket, ~3K/day aggregate) comfortably
  // beats OpenRouter's single shared 1K/day pool across ALL its free models.
  const order: ("groq" | "openrouter" | "anthropic" | "gemini")[] = [
    "groq",
    "openrouter",
    ...paidOrder,
  ];
  return order.filter((p) =>
    p === "openrouter"
      ? hasOpenRouter
      : p === "groq"
        ? hasGroq
        : p === "anthropic"
          ? hasAnthropic
          : hasGemini,
  );
}

/** The provider a fresh request starts with — first in the chain, else heuristic. */
export function resolveAiProvider(): "openrouter" | "groq" | "anthropic" | "gemini" | "heuristic" {
  return resolveAiProviderChain()[0] ?? "heuristic";
}

export const aiEnabled = resolveAiProvider() !== "heuristic";
