import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateNetworkRiskInsights,
  listNetworkRiskInsights,
  resolveNetworkRiskInsight,
  RiskIntelligenceError,
} from "../src/orchestrator.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";

let counter = 0;
function aggregate(overrides: Partial<RiskSignalAggregate>): RiskSignalAggregate {
  counter += 1;
  return {
    id: `agg-${counter}`,
    organizationHash: `org-hash-${counter}`,
    signalType: "deployment_failure",
    industry: "technology",
    signalCount: 70,
    totalDeploymentsCount: 100,
    avgSeverityScore: 0.1,
    maxSeverityScore: 0.12,
    noiseEpsilon: 1.0,
    aggregationWindowHours: 24,
    signalStartTime: new Date("2026-07-20T10:00:00Z"),
    signalEndTime: new Date("2026-07-20T11:00:00Z"),
    createdAt: new Date("2026-07-20T11:00:00Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-07-20T12:00:00Z");

test("generateNetworkRiskInsights returns an empty array when no detector's conditions are met", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const results = await generateNetworkRiskInsights(repo, "technology", NOW);
  assert.deepEqual(results, []);
});

test("generateNetworkRiskInsights runs the root_cause detector and persists a matching insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  // 5+ signals, all deployment_failure, 24h window -- should trigger findRootCause.
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(
      aggregate({ signalType: "deployment_failure", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }),
    );
  }

  const results = await generateNetworkRiskInsights(repo, "technology", NOW);

  assert.ok(results.some((r) => r.type === "root_cause"));
  assert.equal(repo.insights.size, results.length, "every generated insight must actually be persisted");
});

test("generateNetworkRiskInsights does not regenerate a detector type already produced within the dedup window", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(
      aggregate({ signalType: "deployment_failure", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }),
    );
  }

  const first = await generateNetworkRiskInsights(repo, "technology", NOW);
  assert.ok(first.some((r) => r.type === "root_cause"));

  // Running again moments later, same data -- root_cause should be
  // skipped since one was just generated (within the 60-minute dedup
  // window), even though the underlying data would still trigger it.
  const second = await generateNetworkRiskInsights(repo, "technology", new Date(NOW.getTime() + 5 * 60 * 1000));
  assert.equal(second.some((r) => r.type === "root_cause"), false);
});

test("generateNetworkRiskInsights regenerates after the dedup window has passed", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(
      aggregate({ signalType: "deployment_failure", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }),
    );
  }

  await generateNetworkRiskInsights(repo, "technology", NOW);
  const later = await generateNetworkRiskInsights(repo, "technology", new Date(NOW.getTime() + 61 * 60 * 1000));

  assert.ok(later.some((r) => r.type === "root_cause"), "should regenerate once the 60-minute dedup window has elapsed");
});

test("generateNetworkRiskInsights scopes dedup per industry -- a different industry isn't blocked by another's recent insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(
      aggregate({ industry: "technology", signalType: "deployment_failure", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }),
    );
    repo.aggregates.push(
      aggregate({ industry: "healthcare", signalType: "deployment_failure", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }),
    );
  }

  await generateNetworkRiskInsights(repo, "technology", NOW);
  const healthcareResults = await generateNetworkRiskInsights(repo, "healthcare", new Date(NOW.getTime() + 5 * 60 * 1000));

  assert.ok(healthcareResults.some((r) => r.type === "root_cause"), "healthcare's dedup must be independent of technology's");
});

test("listNetworkRiskInsights filters by industry", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(aggregate({ industry: "technology", signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }));
  }
  await generateNetworkRiskInsights(repo, "technology", NOW);

  const results = await listNetworkRiskInsights(repo, { industry: "technology" });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.industry === "technology"));
});

test("resolveNetworkRiskInsight marks the insight resolved", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  for (let i = 0; i < 5; i++) {
    repo.aggregates.push(aggregate({ signalCount: 100, signalStartTime: new Date("2026-07-20T11:00:00Z") }));
  }
  const [generated] = await generateNetworkRiskInsights(repo, "technology", NOW);

  await resolveNetworkRiskInsight(repo, generated!.id, NOW);

  const stored = await repo.getInsightById(generated!.id);
  assert.equal(stored?.isResolved, true);
  assert.equal(stored?.resolvedAt?.toISOString(), NOW.toISOString());
});

test("resolveNetworkRiskInsight throws for an unknown insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => resolveNetworkRiskInsight(repo, "ghost-insight"),
    (err: unknown) => err instanceof RiskIntelligenceError && err.code === "insight_not_found",
  );
});
