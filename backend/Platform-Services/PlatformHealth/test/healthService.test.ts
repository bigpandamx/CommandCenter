import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { computeQueueDepths, computeAiProviderHealth, computeTokenUsageByContext, computeLatencyByService } from "../src/healthService.js";
import { FakePlatformHealthRepository } from "./fakeRepository.js";
import { FakeComplianceRepository } from "../../../Control-Plane/Compliance/test/fakeRepository.js";
import { FakeAgentsRepository } from "../../../Control-Plane/Agents/test/fakeRepository.js";
import { registerComplianceSource } from "../../../Control-Plane/Compliance/src/sourceManagement.js";
import { ingestComplianceItems } from "../../../Control-Plane/Compliance/src/ingestion.js";
import type { AgentTask } from "../../../Control-Plane/Agents/src/types.js";
import type { AiCallRecord, RequestLatencyRecord } from "../src/types.js";

// --- computeQueueDepths ---

async function seedComplianceUpdate(repo: FakeComplianceRepository, externalId: string, status: "new" | "pending_review") {
  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(repo, source, [
    { externalId, title: "Rule", summary: "s", url: `https://example.gov/${externalId}`, publishedAt: null },
  ]);
  const update = (await repo.getUpdateBySourceAndExternalId(source.id, externalId))!;
  await repo.setUpdateStatus(update.id, status);
}

function buildTask(status: AgentTask["status"]): AgentTask {
  return {
    id: randomUUID(),
    capability: "flag_stale_tickets",
    priority: "medium",
    payload: {},
    status,
    createdAt: new Date(),
    startedAt: status === "running" ? new Date() : null,
    completedAt: null,
    result: null,
    error: null,
  };
}

test("computeQueueDepths reads Compliance's real queue counts by status", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const agentsRepo = new FakeAgentsRepository();
  await seedComplianceUpdate(complianceRepo, "a", "new");
  await seedComplianceUpdate(complianceRepo, "b", "new");
  await seedComplianceUpdate(complianceRepo, "c", "pending_review");

  const depths = await computeQueueDepths(complianceRepo, agentsRepo);

  const complianceQueue = depths.find((d) => d.queueName === "compliance_incoming")!;
  assert.equal(complianceQueue.depth, 3);
  assert.deepEqual(complianceQueue.byStatus, { new: 2, pending_review: 1 });
});

test("computeQueueDepths reads Agents' real task queue counts by status", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const agentsRepo = new FakeAgentsRepository();
  await agentsRepo.createTask(buildTask("queued"));
  await agentsRepo.createTask(buildTask("queued"));
  await agentsRepo.createTask(buildTask("running"));
  await agentsRepo.createTask(buildTask("completed")); // should NOT count toward depth

  const depths = await computeQueueDepths(complianceRepo, agentsRepo);

  const agentQueue = depths.find((d) => d.queueName === "agent_tasks")!;
  assert.equal(agentQueue.depth, 3);
  assert.deepEqual(agentQueue.byStatus, { queued: 2, running: 1 });
});

test("computeQueueDepths reports zero depth for genuinely empty queues, not an error", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const agentsRepo = new FakeAgentsRepository();

  const depths = await computeQueueDepths(complianceRepo, agentsRepo);

  assert.equal(depths.find((d) => d.queueName === "compliance_incoming")?.depth, 0);
  assert.equal(depths.find((d) => d.queueName === "agent_tasks")?.depth, 0);
});

// --- computeAiProviderHealth ---

function buildCall(overrides: Partial<AiCallRecord> = {}): AiCallRecord {
  return {
    id: randomUUID(),
    context: "ai_chat",
    success: true,
    tokensUsed: 100,
    latencyMs: 200,
    model: "claude-sonnet-5",
    errorMessage: null,
    occurredAt: new Date(),
    ...overrides,
  };
}

test("computeAiProviderHealth returns null successRate/latency for a genuinely quiet window -- not 0 or NaN", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  const now = new Date();

  const summary = await computeAiProviderHealth(healthRepo, new Date(now.getTime() - 3600_000), now);

  assert.equal(summary.totalCalls, 0);
  assert.equal(summary.successRate, null);
  assert.equal(summary.avgLatencyMs, null);
  assert.equal(summary.p95LatencyMs, null);
});

test("computeAiProviderHealth computes a real success rate and average latency", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordAiCall(buildCall({ success: true, latencyMs: 100 }));
  await healthRepo.recordAiCall(buildCall({ success: true, latencyMs: 200 }));
  await healthRepo.recordAiCall(buildCall({ success: false, latencyMs: 300, tokensUsed: null, errorMessage: "timeout" }));

  const summary = await computeAiProviderHealth(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(summary.totalCalls, 3);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.successRate, 2 / 3);
  assert.equal(summary.avgLatencyMs, 200);
});

test("computeAiProviderHealth's recentFailures includes only failures, most recent first", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  const older = buildCall({ success: false, errorMessage: "first failure", occurredAt: new Date(Date.now() - 10_000) });
  const newer = buildCall({ success: false, errorMessage: "second failure", occurredAt: new Date() });
  await healthRepo.recordAiCall(older);
  await healthRepo.recordAiCall(buildCall({ success: true }));
  await healthRepo.recordAiCall(newer);

  const summary = await computeAiProviderHealth(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(summary.recentFailures.length, 2);
  assert.equal(summary.recentFailures[0]?.errorMessage, "second failure");
  assert.equal(summary.recentFailures[1]?.errorMessage, "first failure");
});

test("computeAiProviderHealth scopes to a single context when given one", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordAiCall(buildCall({ context: "ai_chat" }));
  await healthRepo.recordAiCall(buildCall({ context: "compliance_analysis" }));
  await healthRepo.recordAiCall(buildCall({ context: "compliance_analysis" }));

  const chatSummary = await computeAiProviderHealth(healthRepo, new Date(Date.now() - 3600_000), new Date(), "ai_chat");
  const analysisSummary = await computeAiProviderHealth(
    healthRepo,
    new Date(Date.now() - 3600_000),
    new Date(),
    "compliance_analysis",
  );

  assert.equal(chatSummary.totalCalls, 1);
  assert.equal(chatSummary.context, "ai_chat");
  assert.equal(analysisSummary.totalCalls, 2);
});

test("computeAiProviderHealth excludes calls outside the window on both ends", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  const tooOld = buildCall({ occurredAt: new Date(Date.now() - 7200_000) });
  const tooNew = buildCall({ occurredAt: new Date(Date.now() + 7200_000) });
  const inWindow = buildCall({ occurredAt: new Date() });
  await healthRepo.recordAiCall(tooOld);
  await healthRepo.recordAiCall(tooNew);
  await healthRepo.recordAiCall(inWindow);

  const summary = await computeAiProviderHealth(
    healthRepo,
    new Date(Date.now() - 3600_000),
    new Date(Date.now() + 3600_000),
  );

  assert.equal(summary.totalCalls, 1);
});

test("computeAiProviderHealth's p95 is a real value from the actual latency distribution, not a guess", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  // 100 calls, latencies 1..100ms -- p95 should land at 95.
  for (let i = 1; i <= 100; i++) {
    await healthRepo.recordAiCall(buildCall({ latencyMs: i }));
  }

  const summary = await computeAiProviderHealth(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(summary.p95LatencyMs, 95);
});

// --- computeTokenUsageByContext ---

test("computeTokenUsageByContext breaks totals down by context, not one opaque platform-wide number", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordAiCall(buildCall({ context: "ai_chat", tokensUsed: 100 }));
  await healthRepo.recordAiCall(buildCall({ context: "ai_chat", tokensUsed: 50 }));
  await healthRepo.recordAiCall(buildCall({ context: "compliance_analysis", tokensUsed: 200 }));

  const breakdown = await computeTokenUsageByContext(healthRepo, new Date(Date.now() - 3600_000), new Date());

  const chat = breakdown.find((b) => b.context === "ai_chat")!;
  const analysis = breakdown.find((b) => b.context === "compliance_analysis")!;
  assert.equal(chat.totalTokensUsed, 150);
  assert.equal(chat.callCount, 2);
  assert.equal(analysis.totalTokensUsed, 200);
  assert.equal(analysis.callCount, 1);
});

test("computeTokenUsageByContext treats a failed call's null tokensUsed as 0, not a crash", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordAiCall(buildCall({ context: "ai_chat", success: false, tokensUsed: null }));
  await healthRepo.recordAiCall(buildCall({ context: "ai_chat", tokensUsed: 50 }));

  const breakdown = await computeTokenUsageByContext(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(breakdown[0]?.totalTokensUsed, 50);
  assert.equal(breakdown[0]?.callCount, 2, "both calls count toward callCount even though one contributed 0 tokens");
});

test("computeTokenUsageByContext sorts by total tokens used, highest first", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordAiCall(buildCall({ context: "small", tokensUsed: 10 }));
  await healthRepo.recordAiCall(buildCall({ context: "large", tokensUsed: 1000 }));

  const breakdown = await computeTokenUsageByContext(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(breakdown[0]?.context, "large");
  assert.equal(breakdown[1]?.context, "small");
});

test("computeTokenUsageByContext returns an empty array for a genuinely quiet window", async () => {
  const healthRepo = new FakePlatformHealthRepository();

  const breakdown = await computeTokenUsageByContext(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.deepEqual(breakdown, []);
});

// --- computeLatencyByService ---

function buildLatencyRecord(overrides: Partial<RequestLatencyRecord> = {}): RequestLatencyRecord {
  return {
    id: randomUUID(),
    service: "tickets",
    method: "GET",
    routePattern: "/v1/admin/tickets",
    statusCode: 200,
    latencyMs: 100,
    occurredAt: new Date(),
    ...overrides,
  };
}

test("computeLatencyByService groups by service, not one opaque platform-wide number", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "tickets", latencyMs: 100 }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "tickets", latencyMs: 200 }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "compliance", latencyMs: 500 }));

  const byService = await computeLatencyByService(healthRepo, new Date(Date.now() - 3600_000), new Date());

  const tickets = byService.find((s) => s.service === "tickets")!;
  const compliance = byService.find((s) => s.service === "compliance")!;
  assert.equal(tickets.requestCount, 2);
  assert.equal(tickets.avgLatencyMs, 150);
  assert.equal(compliance.requestCount, 1);
  assert.equal(compliance.avgLatencyMs, 500);
});

test("computeLatencyByService counts only 5xx responses as errors, not 4xx client mistakes", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "tickets", statusCode: 200 }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "tickets", statusCode: 404 }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "tickets", statusCode: 500 }));

  const byService = await computeLatencyByService(healthRepo, new Date(Date.now() - 3600_000), new Date());

  const tickets = byService.find((s) => s.service === "tickets")!;
  assert.equal(tickets.requestCount, 3);
  assert.equal(tickets.errorCount, 1, "only the 500 counts as an error, not the 404");
});

test("computeLatencyByService sorts by average latency, slowest first", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "fast", latencyMs: 10 }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ service: "slow", latencyMs: 900 }));

  const byService = await computeLatencyByService(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(byService[0]?.service, "slow");
  assert.equal(byService[1]?.service, "fast");
});

test("computeLatencyByService returns an empty array for a genuinely quiet window", async () => {
  const healthRepo = new FakePlatformHealthRepository();

  const byService = await computeLatencyByService(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.deepEqual(byService, []);
});

test("computeLatencyByService excludes requests outside the window", async () => {
  const healthRepo = new FakePlatformHealthRepository();
  await healthRepo.recordRequestLatency(buildLatencyRecord({ occurredAt: new Date(Date.now() - 7200_000) }));
  await healthRepo.recordRequestLatency(buildLatencyRecord({ occurredAt: new Date() }));

  const byService = await computeLatencyByService(healthRepo, new Date(Date.now() - 3600_000), new Date());

  assert.equal(byService[0]?.requestCount, 1);
});
