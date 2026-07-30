import { test } from "node:test";
import assert from "node:assert/strict";
import { createRiskFactorMonitorHandler } from "../src/riskFactorMonitorAgent.js";
import { createRiskFactor, classifyInsight } from "../../Risk-Intelligence/src/riskFactorService.js";
import { FakeRiskIntelligenceRepository } from "../../Risk-Intelligence/test/fakeRepository.js";
import type { NetworkRiskInsight } from "../../Risk-Intelligence/src/types.js";

function insight(overrides: Partial<NetworkRiskInsight> = {}): NetworkRiskInsight {
  return {
    id: `insight-${Math.random()}`,
    industry: "technology",
    type: "anomaly",
    severity: "medium",
    summary: "Test insight",
    explanation: "explanation",
    contributingFactors: {},
    recommendation: "recommendation",
    confidence: 0.8,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

test("createRiskFactorMonitorHandler fails clearly when no riskFactorKey is provided in the payload", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const handler = createRiskFactorMonitorHandler(repo);

  const result = await handler({});

  assert.equal(result.success, false);
  assert.ok(result.summary.includes("riskFactorKey"));
});

test("createRiskFactorMonitorHandler fails clearly for an unknown risk factor key, telling staff to create it first", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const handler = createRiskFactorMonitorHandler(repo);

  const result = await handler({ riskFactorKey: "ghost-factor" });

  assert.equal(result.success, false);
  assert.ok(result.summary.includes("ghost-factor"));
  assert.ok(result.summary.toLowerCase().includes("create it first"));
});

test("createRiskFactorMonitorHandler finds nothing when the risk factor exists but has no classified insights yet", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const handler = createRiskFactorMonitorHandler(repo);

  const result = await handler({ riskFactorKey: "vendor-risk" });

  assert.equal(result.success, true);
  assert.equal((result.data as { unresolvedCriticalCount: number }).unresolvedCriticalCount, 0);
});

// --- The load-bearing claim: two specialists genuinely watch different signals ---

test("two risk factors see genuinely different insight sets -- the same underlying data, sliced by real classification", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const vendorRisk = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const aiRisk = await createRiskFactor(repo, { key: "ai-risk", name: "AI Risk", description: "x" });

  const vendorInsight = insight({ id: "vendor-insight", severity: "critical", summary: "OpenAI outage" });
  const aiInsight = insight({ id: "ai-insight", severity: "critical", summary: "Model drift detected" });
  repo.insights.set(vendorInsight.id, vendorInsight);
  repo.insights.set(aiInsight.id, aiInsight);
  await classifyInsight(repo, vendorInsight.id, vendorRisk.key);
  await classifyInsight(repo, aiInsight.id, aiRisk.key);

  const handler = createRiskFactorMonitorHandler(repo);
  const vendorResult = await handler({ riskFactorKey: "vendor-risk" });
  const aiResult = await handler({ riskFactorKey: "ai-risk" });

  assert.deepEqual((vendorResult.data as { flaggedInsightIds: string[] }).flaggedInsightIds, [vendorInsight.id]);
  assert.deepEqual((aiResult.data as { flaggedInsightIds: string[] }).flaggedInsightIds, [aiInsight.id]);
});

test("createRiskFactorMonitorHandler ignores resolved insights and low/medium severity, same as the generic monitor", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });

  const resolved = insight({ id: "resolved", severity: "critical", isResolved: true });
  const lowSeverity = insight({ id: "low", severity: "low", isResolved: false });
  const genuinelyFlagged = insight({ id: "flagged", severity: "high", isResolved: false });
  for (const i of [resolved, lowSeverity, genuinelyFlagged]) {
    repo.insights.set(i.id, i);
    await classifyInsight(repo, i.id, factor.key);
  }

  const handler = createRiskFactorMonitorHandler(repo);
  const result = await handler({ riskFactorKey: "vendor-risk" });

  assert.deepEqual((result.data as { flaggedInsightIds: string[] }).flaggedInsightIds, [genuinelyFlagged.id]);
});

test("createRiskFactorMonitorHandler does not flag an insight classified under a DIFFERENT risk factor, even if it's critical and unresolved", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const vendorRisk = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  await createRiskFactor(repo, { key: "cyber-risk", name: "Cyber Risk", description: "x" });

  const cyberInsight = insight({ id: "cyber-insight", severity: "critical", isResolved: false });
  repo.insights.set(cyberInsight.id, cyberInsight);
  // Classified under cyber-risk, not vendor-risk.
  await classifyInsight(repo, cyberInsight.id, "cyber-risk");

  const handler = createRiskFactorMonitorHandler(repo);
  const vendorResult = await handler({ riskFactorKey: vendorRisk.key });

  assert.deepEqual((vendorResult.data as { flaggedInsightIds: string[] }).flaggedInsightIds, []);
});
