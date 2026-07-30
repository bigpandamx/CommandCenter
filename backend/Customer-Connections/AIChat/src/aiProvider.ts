import type { ChatRole } from "./types.js";

export interface AICompletionResult {
  content: string;
  tokensUsed: number;
  /** The specific model that actually generated this response, e.g. "claude-sonnet-5" -- recorded per-message (ChatMessage.model) since which model handled a given turn is worth knowing, not just which provider is configured. */
  model: string;
}

/**
 * What "the true Aegis AI" actually is, from this module's point of
 * view: something that takes a message history and returns a
 * completion. `chatService.ts` doesn't know or care which vendor is
 * behind it -- this is the same reason every other cross-cutting
 * capability in this codebase (repositories, agent handlers) is defined
 * as a port with a real and a fake implementation, not a concrete class
 * used directly.
 */
export interface AIProvider {
  complete(messages: { role: ChatRole; content: string }[]): Promise<AICompletionResult>;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Calls Anthropic's Messages API directly. Written against the
 * documented request/response shape -- NOT executed against a live API
 * in this session (no network access in the sandbox this was built in,
 * same tier as every Postgres/Fastify integration this whole session).
 * Treat this as a strong first draft: verify the request/response
 * handling against a real key before relying on it in production.
 *
 * "system" role messages are extracted and sent via Anthropic's
 * separate top-level `system` parameter rather than as a message in the
 * `messages` array, matching how Anthropic's API actually expects
 * system prompts to be provided (its message array only accepts
 * "user"/"assistant" roles) -- this is a real API-shape detail, not an
 * arbitrary choice.
 */
export class AnthropicAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-5",
  ) {}

  async complete(messages: { role: ChatRole; content: string }[]): Promise<AICompletionResult> {
    const systemPrompt = messages.find((m) => m.role === "system")?.content;
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API request failed (${response.status}): ${body}`);
    }

    // The offline sandbox's Response shim types .json() as `unknown`
    // (stricter than real fetch's `any`) -- this cast reflects that
    // real fetch would already give us `any` here, not a workaround for
    // a bug.
    const data = (await response.json()) as {
      content?: { type: string; text: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const textBlock = data.content?.find((block) => block.type === "text");
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    return {
      content: textBlock?.text ?? "",
      tokensUsed,
      model: data.model ?? this.model,
    };
  }
}
