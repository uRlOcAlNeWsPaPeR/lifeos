import { env, geminiModelChain } from "@/lib/env";
import { LLMProvider } from "./llm-base";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_SERVER = new Set([500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini-backed provider. Used when GEMINI_API_KEY is present. Uses the
 * REST API directly — no SDK dependency.
 *
 * Tries a chain of Gemini models in order (GEMINI_MODEL, then
 * GEMINI_MODEL_FALLBACKS) — each model carries its own separate free-tier
 * quota, so a 429 (quota exhausted) on one moves straight to the next rather
 * than waiting out a backoff that won't help. Transient 5xx errors still get a
 * couple of quick retries on the SAME model first, since those are infra
 * blips, not a quota problem. A non-retryable error (bad request, auth, a
 * blocked prompt) throws immediately — it'll fail identically on every model,
 * so there's no point cycling. Only once every model is exhausted does this
 * bubble up to LLMProvider, which falls back to the next chained provider (if
 * any) and ultimately the offline heuristic engine.
 */
export class GeminiProvider extends LLMProvider {
  readonly name = "gemini" as const;
  private apiKey = env.GEMINI_API_KEY;
  private models = geminiModelChain();

  protected async complete(
    system: string,
    user: string,
    opts?: { schema?: unknown },
  ): Promise<string> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        // Force the exact output shape when the caller provides a schema — this is
        // what guarantees Brain Dump gets a real `items` array back.
        ...(opts?.schema ? { responseSchema: opts.schema } : {}),
        temperature: 0.2,
        // Gemini 3.x reasons by default and rejects thinkingBudget:0; leave a
        // generous budget so reasoning + the JSON answer both fit.
        maxOutputTokens: 8192,
      },
    });

    let lastErr = "";

    for (const model of this.models) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        let res: Response;
        try {
          res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
            body,
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

        if (res.status === 429) {
          // Quota exhausted on this model specifically — waiting won't free it
          // up, but a different model has its own untouched quota.
          lastErr = `${model}: HTTP 429 (quota)`;
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

        if (res.status === 401 || res.status === 403) {
          // The API key itself is bad/revoked — genuinely account-wide, every
          // model will fail identically, so surface it now instead of cycling.
          const detail = await res.text().catch(() => "");
          throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
        }

        if (!res.ok) {
          // A 400 can be model-specific (an unsupported generationConfig
          // option on a particular model, say) — not necessarily something
          // every other model in the chain will also hit. Move on rather than
          // aborting the whole provider.
          const detail = await res.text().catch(() => "");
          lastErr = `${model}: HTTP ${res.status} ${detail.slice(0, 200)}`;
          break;
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          promptFeedback?: { blockReason?: string };
        };
        if (data.promptFeedback?.blockReason) {
          throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
        }
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (!text) {
          lastErr = `${model}: no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`;
          break; // try the next model rather than retrying an empty response
        }
        return text;
      }
    }

    throw new Error(`Gemini unavailable across ${this.models.length} model(s) — ${lastErr}`);
  }
}
