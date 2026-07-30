/**
 * Foundation for the "true Aegis AI" escalation path: the consumer
 * software (an enrolled Desktop-Apps device, running a lighter local
 * assistant) calls into Command Center when it needs deeper reasoning
 * or a longer response than the local model can produce. Command
 * Center owns the conversation history and the actual model call.
 *
 * Genuinely new -- Aegis's own `chat/page.tsx` is a *governance-testing*
 * interface (send a prompt through Aegis's multi-provider AI proxy,
 * see the resulting risk score) via `services/aiProxy.ts`, not a
 * product assistant. Nothing to migrate; this is new infrastructure.
 * The provider-type vocabulary ("anthropic", "openai", ...) is borrowed
 * from Aegis's own `AIProvider` model (backend/app/models/ai_provider.py)
 * since it's already the established vocabulary for this concept, not
 * reinvented.
 *
 * Device-authenticated the same way Desktop-Apps' own check-in already
 * works (see `authenticateDevice` in Desktop-Apps/src/checkin.ts) --
 * an escalating device is an already-enrolled Desktop-Apps device, not
 * a new identity type.
 */
import type { QuotaUsageSummary } from "../../../Platform-Services/Subscriptions/src/usageService.js";

export type ChatRole = "user" | "assistant" | "system";
export type ConversationStatus = "active" | "closed";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  /** Null for user messages -- only set on the assistant's reply, once the provider reports it. */
  tokensUsed: number | null;
  /** Which model actually generated this message, e.g. "claude-sonnet-5" -- null for user messages. */
  model: string | null;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  organizationId: string;
  deviceId: string;
  status: ConversationStatus;
  startedAt: Date;
  lastMessageAt: Date;
}

export interface SendMessageResult {
  conversation: Conversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  /** Null when the org has no active subscription -- unrestricted, not tracked. */
  quotaUsage: QuotaUsageSummary | null;
}
