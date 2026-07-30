import { randomUUID } from "node:crypto";
import type { AIProvider, AICompletionResult } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ChatRole } from "../../../Customer-Connections/AIChat/src/types.js";
import type { PlatformHealthRepository } from "./repository.js";
import type { AiCallContext, AiCallRecord } from "./types.js";

/**
 * Decorator, not a modification to AIProvider or any existing caller.
 * Every current call site (Customer-Connections/AIChat's chatService.ts,
 * Control-Plane/Compliance's analysisService.ts) keeps calling
 * `.complete()` on whatever AIProvider it was given -- nothing about
 * their code changes. Only server.ts's wiring changes: wrap the real
 * AnthropicAIProvider instance in a TrackedAIProvider once, per
 * context, before handing it to each route registration. A future
 * AI-calling feature (Rule Interpretation, say) gets tracked "for
 * free" by wrapping the same way, not by re-implementing tracking
 * itself.
 *
 * Records BOTH outcomes -- success and failure -- not just failures.
 * AiProviderHealthSummary's successRate needs a true denominator (every
 * attempt), not just a numerator of what went wrong.
 */
export class TrackedAIProvider implements AIProvider {
  constructor(
    private readonly inner: AIProvider,
    private readonly healthRepo: PlatformHealthRepository,
    private readonly context: AiCallContext,
  ) {}

  async complete(messages: { role: ChatRole; content: string }[]): Promise<AICompletionResult> {
    const startedAt = Date.now();
    try {
      const result = await this.inner.complete(messages);
      await this.record({
        success: true,
        tokensUsed: result.tokensUsed,
        latencyMs: Date.now() - startedAt,
        model: result.model,
        errorMessage: null,
      });
      return result;
    } catch (err) {
      await this.record({
        success: false,
        tokensUsed: null,
        latencyMs: Date.now() - startedAt,
        // The model that WOULD have handled this is unknown -- the call
        // never got far enough to say. "unknown" is a real, honest
        // value here, not a guess -- there's no model field to fall
        // back to on a thrown error.
        model: "unknown",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async record(fields: Omit<AiCallRecord, "id" | "context" | "occurredAt">): Promise<void> {
    const record: AiCallRecord = {
      id: randomUUID(),
      context: this.context,
      occurredAt: new Date(),
      ...fields,
    };
    // Recording failure must never mask the real AI-call failure/success
    // this wraps -- a health-tracking bug shouldn't take down AI Chat or
    // Compliance analysis. Logged, not thrown.
    try {
      await this.healthRepo.recordAiCall(record);
    } catch (recordingErr) {
      console.error("TrackedAIProvider: failed to record AI call health", recordingErr);
    }
  }
}
