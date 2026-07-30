import { test } from "node:test";
import assert from "node:assert/strict";
import { createMonitorRiskInsightsHandler } from "../src/riskMonitorAgent.js";
import { FakeRiskIntelligenceRepository } from "../../Risk-Intelligence/test/fakeRepository.js";
import type { NetworkRiskInsight } from "../../Risk-Intelligence/src/types.js";

function insight(overrides: Partial<NetworkRiskInsight>): NetworkRiskInsight {
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

test("monitorRiskInsights finds nothing when there are no unresolved critical/high insights", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  repo.insights.set("i1", insight({ severity: "medium" }));
  repo.insights.set("i2", insight({ severity: "low" }));

  const handler = createMonitorRiskInsightsHandler(repo);
  const result = await handler({});

  assert.equal(result.data.unresolvedCriticalCount, 0);
  assert.equal(result.data.unresolvedHighCount, 0);
});

test("monitorRiskInsights flags unresolved critical and high severity insights", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const critical = insight({ severity: "critical", summary: "Critical spike" });
  const high = insight({ severity: "high", summary: "High trend" });
  repo.insights.set(critical.id, critical);
  repo.insights.set(high.id, high);

  const handler = createMonitorRiskInsightsHandler(repo);
  const result = await handler({});

  assert.equal(result.data.unresolvedCriticalCount, 1);
  assert.equal(result.data.unresolvedHighCount, 1);
  assert.equal((result.data.flaggedInsightIds as string[]).length, 2);
  assert.match(result.recommendations.join("\n"), /Critical spike/);
  assert.match(result.recommendations.join("\n"), /High trend/);
});

test("monitorRiskInsights does not flag a resolved critical insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const resolved = insight({ severity: "critical", isResolved: true });
  repo.insights.set(resolved.id, resolved);

  const handler = createMonitorRiskInsightsHandler(repo);
  const result = await handler({});

  assert.equal(result.data.unresolvedCriticalCount, 0);
});
