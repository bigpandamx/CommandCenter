import { randomUUID } from "node:crypto";
import type { AIChatRepository } from "./repository.js";
import type { AIProvider } from "./aiProvider.js";
import type { ChatMessage, Conversation, SendMessageResult } from "./types.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { getPlanForSubscription } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import { recordUsageUnconditional, getQuotaUsage } from "../../../Platform-Services/Subscriptions/src/usageService.js";
import { assertEntitled, EntitlementError } from "../../../Platform-Services/Entitlements/src/entitlementEngine.js";
import type { Organization } from "../../Desktop-Apps/src/types.js";

export class AIChatError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "invalid_input" | "conversation_closed" | "quota_exceeded" | "not_entitled",
  ) {
    super(message);
    this.name = "AIChatError";
  }
}

/**
 * A single message's content cap. Generous relative to a typical chat
 * turn -- this escalation path exists specifically for "longer, more
 * extensive" responses, so the bound is here to stop genuine abuse
 * (a device sending megabytes of text), not to constrain normal use.
 */
const MAX_CONTENT_LENGTH = 20_000;

/**
 * How much prior conversation gets sent to the AI provider as context,
 * regardless of how long the stored history actually is. Full history
 * is always persisted (see listMessages) -- this only bounds what's
 * fed into each completion call, to keep token cost and latency
 * predictable as a conversation grows long.
 */
const MAX_HISTORY_MESSAGES = 20;

function validateContent(content: string): void {
  if (content.trim().length === 0) {
    throw new AIChatError("Message content must not be empty", "invalid_input");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new AIChatError(
      `Message content exceeds the maximum of ${MAX_CONTENT_LENGTH} characters`,
      "invalid_input",
    );
  }
}

export async function startConversation(
  repo: AIChatRepository,
  organizationId: string,
  deviceId: string,
  now: Date = new Date(),
): Promise<Conversation> {
  const conversation: Conversation = {
    id: randomUUID(),
    organizationId,
    deviceId,
    status: "active",
    startedAt: now,
    lastMessageAt: now,
  };
  await repo.createConversation(conversation);
  return conversation;
}

async function getActiveConversationOrThrow(repo: AIChatRepository, id: string): Promise<Conversation> {
  const conversation = await repo.getConversationById(id);
  if (!conversation) {
    throw new AIChatError(`Unknown conversation: ${id}`, "not_found");
  }
  if (conversation.status !== "active") {
    throw new AIChatError(`Conversation ${id} is closed`, "conversation_closed");
  }
  return conversation;
}

export async function appendUserMessage(
  repo: AIChatRepository,
  conversationId: string,
  content: string,
  now: Date = new Date(),
): Promise<ChatMessage> {
  validateContent(content);
  const conversation = await getActiveConversationOrThrow(repo, conversationId);

  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    role: "user",
    content,
    tokensUsed: null,
    model: null,
    createdAt: now,
  };
  await repo.appendMessage(message);
  await repo.updateConversation({ ...conversation, lastMessageAt: now });
  return message;
}

/**
 * Calls the AI provider with the last MAX_HISTORY_MESSAGES messages as
 * context and persists the response as a new assistant message. Doesn't
 * take a `content` parameter -- it generates a response to whatever's
 * already in the conversation, so it must run after appendUserMessage,
 * not instead of it.
 *
 * Two, deliberately different, kinds of enforcement happen here:
 *
 *   1. CAPABILITY gate, via the Entitlement Engine (assertEntitled): is
 *      "ai_chat" even included in this organization's plan at all? This
 *      is new -- previously nothing checked this, so any org could call
 *      AI Chat regardless of plan, only getting token-limited after the
 *      fact. Falls back to the organization's entitlementTier default
 *      when there's no active subscription (trial: no gated
 *      capabilities; standard/enterprise: ai_chat included) -- a real,
 *      deliberate behavior change from the quota check below, not an
 *      oversight: whether you get a purchasable feature at all should
 *      depend on your actual tier, unlike raw usage limits (see next).
 *
 *   2. QUOTA enforcement (how much can you use), staying exactly as
 *      before -- unrestricted with no active subscription, since that's
 *      about not punishing usage with an arbitrary limit before formal
 *      billing tracking exists for an org, a different concern from
 *      "is this feature purchased at all." Enforced in two places,
 *      because real token cost isn't known until generation finishes:
 *      before calling the provider, reject outright if the
 *      subscription is already fully exhausted (no wasted API spend);
 *      after the provider responds, record the *actual* token count via
 *      recordUsageUnconditional, which never rejects (the tokens were
 *      already spent with the provider by this point). If this specific
 *      generation happens to tip the org over its limit, that's exactly
 *      what the pre-check on the *next* call will catch.
 */
export async function generateAssistantResponse(
  repo: AIChatRepository,
  aiProvider: AIProvider,
  billingRepo: BillingRepository,
  organization: Pick<Organization, "id" | "entitlementTier">,
  conversationId: string,
  now: Date = new Date(),
): Promise<ChatMessage> {
  const conversation = await getActiveConversationOrThrow(repo, conversationId);

  try {
    await assertEntitled(billingRepo, organization, { type: "capability", capability: "ai_chat" });
  } catch (err) {
    if (err instanceof EntitlementError) {
      throw new AIChatError(err.message, "not_entitled");
    }
    throw err;
  }

  const subscription = await billingRepo.getActiveSubscriptionForOrg(conversation.organizationId);
  if (subscription) {
    const plan = await getPlanForSubscription(billingRepo, subscription);
    if (plan.monthlyTokenQuota !== null && subscription.currentTokensUsed >= plan.monthlyTokenQuota) {
      throw new AIChatError(
        `Organization has exhausted its monthly AI token quota (${plan.monthlyTokenQuota})`,
        "quota_exceeded",
      );
    }
  }

  const history = await repo.listMessages(conversationId);
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const completion = await aiProvider.complete(
    recentHistory.map((m) => ({ role: m.role, content: m.content })),
  );

  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    role: "assistant",
    content: completion.content,
    tokensUsed: completion.tokensUsed,
    model: completion.model,
    createdAt: now,
  };
  await repo.appendMessage(message);
  await repo.updateConversation({ ...conversation, lastMessageAt: now });

  if (subscription) {
    await recordUsageUnconditional(billingRepo, subscription, { tokensUsed: completion.tokensUsed, requestCount: 1 }, now);
  }

  return message;
}

/**
 * The actual entry point the escalation endpoint calls: continues the
 * device's existing active conversation if it has one, otherwise starts
 * a new one, appends the user's message, and generates the response --
 * one call standing in for what would otherwise be three separate
 * round trips for a caller to orchestrate correctly.
 */
export async function sendMessage(
  repo: AIChatRepository,
  aiProvider: AIProvider,
  billingRepo: BillingRepository,
  organization: Pick<Organization, "id" | "entitlementTier">,
  deviceId: string,
  content: string,
  now: Date = new Date(),
): Promise<SendMessageResult> {
  const existing = await repo.getActiveConversationForDevice(deviceId);
  const conversation = existing ?? (await startConversation(repo, organization.id, deviceId, now));

  const userMessage = await appendUserMessage(repo, conversation.id, content, now);
  const assistantMessage = await generateAssistantResponse(repo, aiProvider, billingRepo, organization, conversation.id, now);

  const refreshed = await repo.getConversationById(conversation.id);
  const subscription = await billingRepo.getActiveSubscriptionForOrg(organization.id);
  const quotaUsage = subscription ? await getQuotaUsage(billingRepo, subscription) : null;

  return { conversation: refreshed ?? conversation, userMessage, assistantMessage, quotaUsage };
}

export async function closeConversation(
  repo: AIChatRepository,
  conversationId: string,
  now: Date = new Date(),
): Promise<Conversation> {
  const conversation = await repo.getConversationById(conversationId);
  if (!conversation) {
    throw new AIChatError(`Unknown conversation: ${conversationId}`, "not_found");
  }
  const updated: Conversation = { ...conversation, status: "closed", lastMessageAt: now };
  await repo.updateConversation(updated);
  return updated;
}
