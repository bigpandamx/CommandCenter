import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackedAIProvider } from "../src/aiProviderTracking.js";
import { FakePlatformHealthRepository } from "./fakeRepository.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";

test("TrackedAIProvider returns the wrapped provider's real result unchanged", async () => {
  const inner = new FakeAIProvider();
  inner.nextResponse = { content: "hello", tokensUsed: 42, model: "claude-sonnet-5" };
  const healthRepo = new FakePlatformHealthRepository();
  const tracked = new TrackedAIProvider(inner, healthRepo, "ai_chat");

  const result = await tracked.complete([{ role: "user", content: "hi" }]);

  assert.deepEqual(result, { content: "hello", tokensUsed: 42, model: "claude-sonnet-5" });
});

test("TrackedAIProvider records a successful call with the real token count and model", async () => {
  const inner = new FakeAIProvider();
  inner.nextResponse = { content: "hello", tokensUsed: 42, model: "claude-sonnet-5" };
  const healthRepo = new FakePlatformHealthRepository();
  const tracked = new TrackedAIProvider(inner, healthRepo, "ai_chat");

  await tracked.complete([{ role: "user", content: "hi" }]);

  assert.equal(healthRepo.records.length, 1);
  const record = healthRepo.records[0]!;
  assert.equal(record.success, true);
  assert.equal(record.tokensUsed, 42);
  assert.equal(record.model, "claude-sonnet-5");
  assert.equal(record.errorMessage, null);
  assert.equal(record.context, "ai_chat");
  assert.ok(record.latencyMs >= 0);
});

test("TrackedAIProvider records a failed call, with tokensUsed null and the real error message", async () => {
  const inner = new FakeAIProvider();
  inner.shouldThrow = new Error("provider unavailable");
  const healthRepo = new FakePlatformHealthRepository();
  const tracked = new TrackedAIProvider(inner, healthRepo, "compliance_analysis");

  await assert.rejects(() => tracked.complete([{ role: "user", content: "hi" }]), /provider unavailable/);

  assert.equal(healthRepo.records.length, 1);
  const record = healthRepo.records[0]!;
  assert.equal(record.success, false);
  assert.equal(record.tokensUsed, null);
  assert.equal(record.model, "unknown");
  assert.equal(record.errorMessage, "provider unavailable");
  assert.equal(record.context, "compliance_analysis");
});

test("TrackedAIProvider still throws the original error after recording the failure -- health tracking never swallows a real failure", async () => {
  const inner = new FakeAIProvider();
  inner.shouldThrow = new Error("boom");
  const healthRepo = new FakePlatformHealthRepository();
  const tracked = new TrackedAIProvider(inner, healthRepo, "ai_chat");

  await assert.rejects(() => tracked.complete([{ role: "user", content: "hi" }]), /boom/);
});

test("TrackedAIProvider still returns the real result even if recording health itself fails -- a health-tracking bug must not take down a real AI call", async () => {
  const inner = new FakeAIProvider();
  inner.nextResponse = { content: "hello", tokensUsed: 42, model: "claude-sonnet-5" };
  const healthRepo = new FakePlatformHealthRepository();
  healthRepo.recordAiCall = async () => {
    throw new Error("db unavailable");
  };
  const tracked = new TrackedAIProvider(inner, healthRepo, "ai_chat");

  const result = await tracked.complete([{ role: "user", content: "hi" }]);

  assert.equal(result.content, "hello");
});

test("TrackedAIProvider tags every call with the context it was constructed with", async () => {
  const inner = new FakeAIProvider();
  inner.nextResponse = { content: "hello", tokensUsed: 10, model: "claude-sonnet-5" };
  const healthRepo = new FakePlatformHealthRepository();
  const trackedChat = new TrackedAIProvider(inner, healthRepo, "ai_chat");
  const trackedAnalysis = new TrackedAIProvider(inner, healthRepo, "compliance_analysis");

  await trackedChat.complete([{ role: "user", content: "hi" }]);
  await trackedAnalysis.complete([{ role: "user", content: "hi" }]);

  assert.deepEqual(
    healthRepo.records.map((r) => r.context),
    ["ai_chat", "compliance_analysis"],
  );
});
