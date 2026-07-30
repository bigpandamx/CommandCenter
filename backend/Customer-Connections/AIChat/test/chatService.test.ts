import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startConversation,
  appendUserMessage,
  generateAssistantResponse,
  sendMessage,
  closeConversation,
  AIChatError,
} from "../src/chatService.js";
import { FakeAIChatRepository } from "./fakeRepository.js";
import { FakeAIProvider } from "./fakeAIProvider.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { createPlan, subscribeOrganization } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";

/** Enterprise tier's default policy includes ai_chat -- these tests aren't testing entitlement gating itself (see the dedicated capability-gate tests below), so this keeps their old, pre-gate behavior intact. */
const ORG = { id: "org-1", entitlementTier: "enterprise" as const };

test("startConversation creates an active conversation", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  assert.equal(conversation.status, "active");
  assert.equal(conversation.organizationId, "org-1");
  assert.equal(conversation.deviceId, "device-1");
});

test("appendUserMessage rejects empty content", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  await assert.rejects(
    () => appendUserMessage(repo, conversation.id, "   "),
    (err: unknown) => err instanceof AIChatError && err.code === "invalid_input",
  );
});

test("appendUserMessage rejects content over the length cap", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  await assert.rejects(
    () => appendUserMessage(repo, conversation.id, "x".repeat(20_001)),
    (err: unknown) => err instanceof AIChatError && err.code === "invalid_input",
  );
});

test("appendUserMessage accepts content right at the length cap", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  const message = await appendUserMessage(repo, conversation.id, "x".repeat(20_000));
  assert.equal(message.content.length, 20_000);
});

test("appendUserMessage throws not_found for an unknown conversation", async () => {
  const repo = new FakeAIChatRepository();
  await assert.rejects(
    () => appendUserMessage(repo, "ghost", "hello"),
    (err: unknown) => err instanceof AIChatError && err.code === "not_found",
  );
});

test("appendUserMessage rejects appending to a closed conversation", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  await closeConversation(repo, conversation.id);

  await assert.rejects(
    () => appendUserMessage(repo, conversation.id, "hello"),
    (err: unknown) => err instanceof AIChatError && err.code === "conversation_closed",
  );
});

test("generateAssistantResponse calls the AI provider and persists the result", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  provider.nextResponse = { content: "Here's the answer.", tokensUsed: 100, model: "claude-sonnet-5" };
  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "What's my compliance status?");

  const response = await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);

  assert.equal(response.role, "assistant");
  assert.equal(response.content, "Here's the answer.");
  assert.equal(response.tokensUsed, 100);
  assert.equal(response.model, "claude-sonnet-5");
});

test("generateAssistantResponse sends the conversation history to the provider in chronological order", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "First question");
  await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);
  await appendUserMessage(repo, conversation.id, "Follow-up question");
  await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);

  const secondCall = provider.calls[1];
  assert.equal(secondCall?.length, 3, "should include: first question, first answer, follow-up question");
  assert.equal(secondCall?.[0]?.content, "First question");
  assert.equal(secondCall?.[2]?.content, "Follow-up question");
});

test("generateAssistantResponse only sends the last MAX_HISTORY_MESSAGES to the provider, even with a much longer stored history", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");

  for (let i = 0; i < 15; i++) {
    await appendUserMessage(repo, conversation.id, `Message ${i}`);
    await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);
  }
  // 15 rounds = 30 stored messages total. One more round makes 32.
  await appendUserMessage(repo, conversation.id, "Final question");
  await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);

  const lastCall = provider.calls[provider.calls.length - 1];
  assert.equal(lastCall?.length, 20, "context window should be capped at MAX_HISTORY_MESSAGES");
  assert.equal(lastCall?.[lastCall.length - 1]?.content, "Final question", "the window should still include the newest message");

  const fullHistory = await repo.listMessages(conversation.id);
  assert.equal(fullHistory.length, 32, "full history should still be persisted, only the provider call is windowed");
});

test("generateAssistantResponse propagates an error from the AI provider rather than silently swallowing it", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  provider.shouldThrow = new Error("Anthropic API request failed (500): internal error");
  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  await assert.rejects(
    () => generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id),
    /Anthropic API request failed/,
  );
});

test("sendMessage starts a new conversation when the device has none active", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();

  const result = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "hello");

  assert.equal(result.conversation.deviceId, "device-1");
  assert.equal(result.userMessage.content, "hello");
  assert.equal(result.assistantMessage.role, "assistant");
});

test("sendMessage continues the device's existing active conversation instead of starting a new one", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();

  const first = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "first message");
  const second = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "second message");

  assert.equal(second.conversation.id, first.conversation.id, "should continue the same conversation, not start a new one");
  const history = await repo.listMessages(first.conversation.id);
  assert.equal(history.length, 4, "2 user + 2 assistant messages across both calls");
});

test("sendMessage starts a fresh conversation for a different device even if another device has one active", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();

  const deviceA = await sendMessage(repo, provider, billingRepo, ORG, "device-a", "hello from A");
  const deviceB = await sendMessage(repo, provider, billingRepo, ORG, "device-b", "hello from B");

  assert.notEqual(deviceA.conversation.id, deviceB.conversation.id);
});

test("sendMessage starts a new conversation for a device whose previous conversation was closed", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();

  const first = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "first");
  await closeConversation(repo, first.conversation.id);
  const second = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "second");

  assert.notEqual(second.conversation.id, first.conversation.id);
  assert.equal(second.conversation.status, "active");
});

test("closeConversation marks the conversation closed", async () => {
  const repo = new FakeAIChatRepository();
  const conversation = await startConversation(repo, "org-1", "device-1");
  const closed = await closeConversation(repo, conversation.id);
  assert.equal(closed.status, "closed");
});

test("closeConversation throws not_found for an unknown conversation", async () => {
  const repo = new FakeAIChatRepository();
  await assert.rejects(
    () => closeConversation(repo, "ghost"),
    (err: unknown) => err instanceof AIChatError && err.code === "not_found",
  );
});

async function seedSubscribedOrg(billingRepo: FakeBillingRepository, monthlyTokenQuota: number | null) {
  await createPlan(billingRepo, {
    code: "metered",
    name: "Metered",
    billingCycle: "monthly",
    basePriceCents: 10000,
    monthlyTokenQuota,
    monthlyRequestQuota: null,
    allowedChannels: ["stable"],
    includedCapabilities: ["ai_chat"], // these tests are about quota enforcement, not entitlement gating -- a real metered-AI plan would obviously grant the capability it meters
  });
  return subscribeOrganization(billingRepo, "org-1", "metered");
}

test("generateAssistantResponse proceeds normally for an org with no active subscription -- unrestricted by default", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository(); // no subscription seeded
  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  const response = await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);
  assert.equal(response.role, "assistant");
});

test("generateAssistantResponse rejects BEFORE calling the provider when the org's token quota is already exhausted", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  await seedSubscribedOrg(billingRepo, 1000);
  const sub = await billingRepo.getActiveSubscriptionForOrg("org-1");
  await billingRepo.updateSubscription({ ...sub!, currentTokensUsed: 1000 }); // already at the limit

  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  await assert.rejects(
    () => generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id),
    (err: unknown) => err instanceof AIChatError && err.code === "quota_exceeded",
  );
  assert.equal(provider.calls.length, 0, "the provider must never be called once quota is already exhausted -- no wasted API spend");
});

test("generateAssistantResponse succeeds and records real usage when the org is within quota", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: "answer", tokensUsed: 250, model: "claude-sonnet-5" };
  const billingRepo = new FakeBillingRepository();
  await seedSubscribedOrg(billingRepo, 1000);

  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "hello");
  await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);

  const sub = await billingRepo.getActiveSubscriptionForOrg("org-1");
  assert.equal(sub?.currentTokensUsed, 250, "real token usage from the completion should be recorded");
});

test("generateAssistantResponse still returns the response even when THIS generation tips the org over quota -- only the NEXT call is blocked", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: "answer", tokensUsed: 900, model: "claude-sonnet-5" };
  const billingRepo = new FakeBillingRepository();
  await seedSubscribedOrg(billingRepo, 1000);
  const sub = await billingRepo.getActiveSubscriptionForOrg("org-1");
  await billingRepo.updateSubscription({ ...sub!, currentTokensUsed: 200 }); // 200 + 900 = 1100 > 1000

  const conversation = await startConversation(repo, "org-1", "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  // This call succeeds -- the tokens were already spent with the
  // provider by the time the count is known, so there's nothing left
  // to reject.
  const response = await generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id);
  assert.equal(response.content, "answer");

  const updatedSub = await billingRepo.getActiveSubscriptionForOrg("org-1");
  assert.equal(updatedSub?.currentTokensUsed, 1100, "real usage must still be recorded even though it exceeds the quota");

  // The NEXT call is where enforcement actually bites.
  await appendUserMessage(repo, conversation.id, "another message");
  await assert.rejects(
    () => generateAssistantResponse(repo, provider, billingRepo, ORG, conversation.id),
    (err: unknown) => err instanceof AIChatError && err.code === "quota_exceeded",
  );
});

test("sendMessage's quotaUsage is null for an org with no active subscription", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();

  const result = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "hello");
  assert.equal(result.quotaUsage, null);
});

test("sendMessage's quotaUsage reflects real usage for a subscribed org", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: "answer", tokensUsed: 300, model: "claude-sonnet-5" };
  const billingRepo = new FakeBillingRepository();
  await seedSubscribedOrg(billingRepo, 1000);

  const result = await sendMessage(repo, provider, billingRepo, ORG, "device-1", "hello");

  assert.deepEqual(result.quotaUsage?.tokens, { used: 300, limit: 1000, remaining: 700 });
});

test("generateAssistantResponse rejects with not_entitled when the org's tier doesn't include ai_chat, and never calls the provider", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const trialOrg = { id: "org-trial", entitlementTier: "trial" as const }; // trial's default policy grants no capabilities

  const conversation = await startConversation(repo, trialOrg.id, "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  await assert.rejects(
    () => generateAssistantResponse(repo, provider, billingRepo, trialOrg, conversation.id),
    (err: unknown) => err instanceof AIChatError && err.code === "not_entitled",
  );
  assert.equal(provider.calls.length, 0, "the provider must never be called for an org not entitled to this capability -- no wasted API spend");
});

test("generateAssistantResponse succeeds for an org whose tier includes ai_chat by default (no subscription needed)", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const enterpriseOrg = { id: "org-ent", entitlementTier: "enterprise" as const };

  const conversation = await startConversation(repo, enterpriseOrg.id, "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  const response = await generateAssistantResponse(repo, provider, billingRepo, enterpriseOrg, conversation.id);
  assert.equal(response.role, "assistant");
});

test("generateAssistantResponse succeeds for a trial-tier org whose real subscription plan explicitly grants ai_chat -- the plan supersedes the tier default", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const trialOrg = { id: "org-1", entitlementTier: "trial" as const };
  await seedSubscribedOrg(billingRepo, 1000); // grants ai_chat explicitly, see the helper

  const conversation = await startConversation(repo, trialOrg.id, "device-1");
  await appendUserMessage(repo, conversation.id, "hello");

  const response = await generateAssistantResponse(repo, provider, billingRepo, trialOrg, conversation.id);
  assert.equal(response.role, "assistant");
});

test("sendMessage propagates the not_entitled rejection the same way as any other AIChatError", async () => {
  const repo = new FakeAIChatRepository();
  const provider = new FakeAIProvider();
  const billingRepo = new FakeBillingRepository();
  const trialOrg = { id: "org-trial", entitlementTier: "trial" as const };

  await assert.rejects(
    () => sendMessage(repo, provider, billingRepo, trialOrg, "device-1", "hello"),
    (err: unknown) => err instanceof AIChatError && err.code === "not_entitled",
  );
});
