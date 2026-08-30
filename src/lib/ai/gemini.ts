import { env } from "@/lib/env";
import { LLMProvider } from "./llm-base";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini-backed provider. Used when GEMINI_API_KEY is present
 * (and no ANTHROPIC_API_KEY). Uses the REST API directly — no SDK dependency.
 *
 * Retries transient 429/5xx responses with backoff. Any unrecoverable error
 * bubbles up to LLMProvider, which falls back to the offline heuristic engine
 * so Brain Dump / prioritization / the assistant never hard-fail.
 */
export class GeminiProvider extends LLMProvider {
  readonly name = "gemini" as const;
  private apiKey = env.GEMINI_API_KEY;
  private model = env.GEMINI_MODEL;

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

    const maxAttempts = 3;
    let lastErr = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body,
          signal: AbortSignal.timeout(25_000),
        });
      } catch (e) {
        lastErr = (e as Error).message;
        if (attempt < maxAttempts) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(`Gemini request failed: ${lastErr}`);
      }

      if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
        lastErr = `HTTP ${res.status}`;
        await sleep(600 * attempt + Math.random() * 300);
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
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
        throw new Error(
          `Gemini returned no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`,
        );
      }
      return text;
    }

    throw new Error(`Gemini unavailable after ${maxAttempts} attempts (${lastErr})`);
  }
}
