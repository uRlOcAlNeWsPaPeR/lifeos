// Centralised environment access. Firebase config is validated where it's used
// (client shows a friendly "not configured" screen; admin throws on first call).

export const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  AI_PROVIDER: (process.env.AI_PROVIDER as "auto" | "anthropic" | "gemini" | "heuristic") || "auto",
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "LifeOS",
};

/** Resolve which AI engine to use from the configured keys + AI_PROVIDER. */
export function resolveAiProvider(): "anthropic" | "gemini" | "heuristic" {
  const pref = env.AI_PROVIDER;
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(env.GEMINI_API_KEY);

  if (pref === "anthropic") return hasAnthropic ? "anthropic" : "heuristic";
  if (pref === "gemini") return hasGemini ? "gemini" : "heuristic";
  if (pref === "heuristic") return "heuristic";

  if (hasAnthropic) return "anthropic";
  if (hasGemini) return "gemini";
  return "heuristic";
}

export const aiEnabled = resolveAiProvider() !== "heuristic";
