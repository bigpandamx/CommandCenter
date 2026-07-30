import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrganizationBenchmarkRanking } from "../src/benchmarkRanking.js";
import { calculateIndustryBenchmark } from "../src/benchmarks.js";
import { setConsent } from "../src/consent.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";
import type { RiskSignalAggregate } from "../src/riskSignals.js";

function seedAggregate(repo: FakeThreatIntelRepository, avgSeverityScore: number, orgHash: string): void {
  const now = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const aggregate: RiskSignalAggregate = {
    id: `agg-${Math.random()}`,
    organizationHash: orgHash,
    signalType: "deployment_failure",
    industry: "technology",
    signalCount: 5,
    totalDeploymentsCount: 100,
    avgSeverityScore,
    maxSeverityScore: avgSeverityScore,
    noiseEpsilon: 1.0,
    aggregationWindowHours: 24,
    signalStartTime: now,
    signalEndTime: now,
    createdAt: now,
  };
  repo.riskSignalAggregates.push(aggregate);
}

test("getOrganizationBenchmarkRanking returns a synthetic ranking when no real benchmark exists yet", async () => {
  const repo = new FakeThreatIntelRepository();
  const ranking = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.5);
  assert.equal(ranking.synthetic, true);
  assert.equal(ranking.sampleSize, 0);
});

test("getOrganizationBenchmarkRanking uses a real benchmark once one has been calculated", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, (i + 1) * 0.1, `org-hash-${i}`);
  }
  const now = new Date();
  await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, now);

  const ranking = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.5, now);
  assert.equal(ranking.synthetic, false);
  assert.equal(ranking.sampleSize, 10);
});

test("getOrganizationBenchmarkRanking marks contributing: true only when the org has consented to shareBenchmarkData", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareBenchmarkData: true });
  const contributing = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.5);
  assert.equal(contributing.contributing, true);

  const notContributing = await getOrganizationBenchmarkRanking(repo, "org-2", "technology", "risk_score", 0.5);
  assert.equal(notContributing.contributing, false);
});

test("getOrganizationBenchmarkRanking: higher risk_score value ranks in a higher percentile (higher is worse framing aside, direction is 'higher value = higher percentile' for non-inverse metrics)", async () => {
  const repo = new FakeThreatIntelRepository();
  const highValue = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.95); // above synthetic p90 (0.85)
  assert.equal(highValue.percentileRank, 90);

  const lowValue = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.1); // below synthetic p10 (0.3)
  assert.equal(lowValue.percentileRank, 5);
});

test("getOrganizationBenchmarkRanking inverts the direction for deployment_failure_rate (lower is better)", async () => {
  const repo = new FakeThreatIntelRepository();
  // Synthetic defaults for deployment_failure_rate: [0.02, 0.05, 0.10, 0.18, 0.25]
  const lowFailureRate = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "deployment_failure_rate", 0.01);
  assert.equal(lowFailureRate.percentileRank, 90, "a LOW failure rate should rank in a HIGH percentile (good)");

  const highFailureRate = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "deployment_failure_rate", 0.5);
  assert.equal(highFailureRate.percentileRank, 5, "a HIGH failure rate should rank in a LOW percentile (bad)");
});

test("getOrganizationBenchmarkRanking performance tier matches the percentile band", async () => {
  const repo = new FakeThreatIntelRepository();
  const excellent = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.95);
  assert.equal(excellent.performance, "excellent");

  const poor = await getOrganizationBenchmarkRanking(repo, "org-1", "technology", "risk_score", 0.05);
  assert.equal(poor.performance, "poor");
});
