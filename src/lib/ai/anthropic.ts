import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { LLMProvider } from "./llm-base";

/**
 * Claude-backed provider. Used only when ANTHROPIC_API_KEY is present.
 * All prompting / JSON handling / heuristic fallback lives in LLMProvider.
 */
const VISION_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic" as const;
  protected supportsVision = true;
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  private model = env.ANTHROPIC_MODEL;

  protected async complete(
    system: string,
    user: string,
    opts?: { schema?: unknown; image?: { mimeType: string; data: string } },
  ): Promise<string> {
    // Claude follows the prompt's JSON contract; no schema hook needed.
    const content: Anthropic.Messages.MessageParam["content"] =
      opts?.image && VISION_MEDIA_TYPES.has(opts.image.mimeType)
        ? [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: opts.image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: opts.image.data,
              },
            },
            { type: "text", text: user },
          ]
        : user;

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content }],
    });
    return res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  }
}
