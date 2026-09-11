import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { env, appOrigin, openRouterModelChain } from "@/lib/env";
import { adminDb } from "@/lib/firebase/admin";
import { periodKey } from "@/lib/firebase/schema";
import { LLMProvider } from "./llm-base";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const RETRYABLE_SERVER = new Set([500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;

// OpenRouter's ":free" tier is ONE pool shared across the whole account — not
// per-user, not per-model: 20 requests/minute, and 1,000/day once $10+ of
// lifetime credit has been purchased (50/day before that). Cycling models
// below buys resilience against any single model being degraded; it does NOT
// raise that shared ceiling. This budget keeps LifeOS's own usage comfortably
// under it (real margin for bursts + whatever else might be sharing the
// account) so a busy day quietly overflows to the next provider instead of
// retry-storming the account into 429s. Safe at 900 (vs. the earlier, more
// conservative 700) now that the counter below tracks every real attempt
// instead of only successes — see recordUsage().
const DAILY_BUDGET = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenRouter-backed provider — the $0 first layer. Used when OPENROUTER_API_KEY
 * and at least one OPENROUTER_MODELS entry are configured (see env.ts). Tries a
 * chain of free (":free") models in order: a 429 on one moves straight to the
 * next (a different model has its own moderation/availability, though they all
 * draw from the same account-wide rate-limit pool — see DAILY_BUDGET above).
 * Transient 5xx gets a couple of quick retries on the same model first, since
 * those are infra blips, not a quota problem. Once every model is exhausted, or
 * the daily budget is already spent, this throws and LLMProvider falls back to
 * the next configured provider (Gemini/Anthropic), then the offline engine.
 */
export class OpenRouterProvider extends LLMProvider {
  readonly name = "openrouter" as const;
  private apiKey = env.OPENROUTER_API_KEY;
  private models = openRouterModelChain();

  protected async complete(
    system: string,
    user: string,
    _opts?: { schema?: unknown },
  ): Promise<string> {
    // Free-tier "schema enforcement" is spotty and model-dependent — the shared
    // LLMProvider JSON extractor (tolerant of prose/fences) is the real safety
    // net here, not a forced schema. `response_format` below is a widely
    // supported hint that costs nothing when a model ignores it.
    void _opts;

    if (await this.overBudget()) {
      throw new Error("OpenRouter daily budget reached for today — skipping to the next provider");
    }

    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    let lastErr = "";

    for (const model of this.models) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        let res: Response;
        try {
          res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": appOrigin(),
              "X-Title": env.NEXT_PUBLIC_APP_NAME,
            },
            body: JSON.stringify({
              model,
              messages,
              response_format: { type: "json_object" },
              temperature: 0.2,
            }),
            signal: AbortSignal.timeout(25_000),
          });
        } catch (e) {
          // Unknown whether this actually reached OpenRouter's servers before
          // failing — count it anyway. Overcounting a network blip costs a
          // negligible sliver of budget; undercounting is what let the real
          // ceiling sneak up on the old success-only counter.
          this.recordUsage();
          lastErr = `${model}: ${(e as Error).message}`;
          if (attempt < ATTEMPTS_PER_MODEL) {
            await sleep(500 * attempt);
            continue;
          }
          break; // this model's out — try the next one
        }

        // A response of ANY kind (429, 5xx, ok) means this attempt actually
        // spent one of the account's real requests — count it here, once,
        // regardless of outcome. (Previously this only counted on success,
        // which under-tracked usage right when things were getting tight —
        // exactly the wrong time for the budget check to be optimistic.)
        this.recordUsage();

        if (res.status === 429) {
          // Could be this model's own limit or the account-wide pool — either
          // way, waiting won't help within a single user request. Try the next
          // model; if the pool itself is spent every model will 429 in turn and
          // we fall through to the next provider below.
          lastErr = `${model}: HTTP 429 (rate limited)`;
          break;
        }

        if (RETRYABLE_SERVER.has(res.status)) {
          lastErr = `${model}: HTTP ${res.status}`;
          if (attempt < ATTEMPTS_PER_MODEL) {
            await sleep(600 * attempt + Math.random() * 300);
            continue;
          }
          break; // retries exhausted on this model — try the next one
        }

        if (!res.ok) {
          // Not model-specific (bad request, auth, etc.) — every model will
          // fail the same way, so surface it now instead of cycling.
          const detail = await res.text().catch(() => "");
          throw new Error(`OpenRouter API ${res.status}: ${detail.slice(0, 300)}`);
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) {
          lastErr = `${model}: no text${
            data.choices?.[0]?.finish_reason ? ` (${data.choices[0].finish_reason})` : ""
          }`;
          break; // try the next model rather than retrying an empty response
        }

        return text;
      }
    }

    throw new Error(`OpenRouter unavailable across ${this.models.length} model(s) — ${lastErr}`);
  }

  /** Today's OpenRouter call count vs. the safety budget — one cheap read. */
  private async overBudget(): Promise<boolean> {
    try {
      const snap = await adminDb().collection("system").doc("openrouterUsage").get();
      const count = (snap.data()?.[periodKey("day")] as number) ?? 0;
      return count >= DAILY_BUDGET;
    } catch {
      return false; // a failed check shouldn't itself block a request
    }
  }

  /** Best-effort counter — a missed increment just costs a little margin, not correctness. */
  private recordUsage(): void {
    adminDb()
      .collection("system")
      .doc("openrouterUsage")
      .set({ [periodKey("day")]: FieldValue.increment(1) }, { merge: true })
      .catch(() => {});
  }
}
