import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { LLMProvider } from "./llm-base";

/**
 * Claude-backed provider. Used only when ANTHROPIC_API_KEY is present.
 * All prompting / JSON handling / heuristic fallback lives in LLMProvider.
 */
export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic" as const;
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  private model = env.ANTHROPIC_MODEL;

  protected async complete(
    system: string,
    user: string,
    _opts?: { schema?: unknown },
  ): Promise<string> {
    void _opts; // Claude follows the prompt's JSON contract; no schema hook needed
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    });
    return res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  }
}
