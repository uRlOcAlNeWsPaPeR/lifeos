import "server-only";
import { env, groqModelChain } from "@/lib/env";
import { LLMProvider } from "./llm-base";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const RETRYABLE_SERVER = new Set([500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Groq-backed provider — the second free layer, tried after OpenRouter's
 * free pool and before Gemini/Anthropic (see resolveAiProviderChain in
 * env.ts). Used when GROQ_API_KEY and at least one GROQ_MODELS entry are
 * configured. Unlike OpenRouter's shared account-wide pool, Groq publishes
 * real per-model rate limits (RPM/RPD/TPM) with no credit card required —
 * see console.groq.com/docs/models for current numbers. A 429 on one model
 * moves to the next, since each model has its own separate limit; a
 * transient 5xx gets a couple of quick retries first, since that's an infra
 * blip, not a quota problem.
 */
export class GroqProvider extends LLMProvider {
  readonly name = "groq" as const;
  private apiKey = env.GROQ_API_KEY;
  private models = groqModelChain();

  protected async complete(
    system: string,
    user: string,
    _opts?: { schema?: unknown },
  ): Promise<string> {
    // Not every Groq model honours response_format: json_object — the
    // shared LLMProvider JSON extractor (tolerant of prose/fences) is the
    // real safety net here, not this hint.
    void _opts;

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
          lastErr = `${model}: ${(e as Error).message}`;
          if (attempt < ATTEMPTS_PER_MODEL) {
            await sleep(500 * attempt);
            continue;
          }
          break; // this model's out — try the next one
        }

        if (res.status === 401 || res.status === 403) {
          // The API key itself is bad/revoked — genuinely account-wide, every
          // model will fail identically, so surface it now instead of cycling.
          const detail = await res.text().catch(() => "");
          throw new Error(`Groq API ${res.status}: ${detail.slice(0, 300)}`);
        }

        if (res.status === 429) {
          // This model's own rate limit — a different model has its own
          // separate one, so try it rather than waiting out a backoff.
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
          // Model-specific (e.g. that model doesn't support this request
          // shape) — move on rather than aborting the whole provider.
          const detail = await res.text().catch(() => "");
          lastErr = `${model}: HTTP ${res.status} ${detail.slice(0, 200)}`;
          break;
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

    throw new Error(`Groq unavailable across ${this.models.length} model(s) — ${lastErr}`);
  }
}
