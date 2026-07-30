import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateIndustryBenchmark, getIndustryBenchmark, listAllIndustryBenchmarks } from "../src/benchmarks.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";
import type { RiskSignalAggregate } from "../src/riskSignals.js";

function seedAggregate(repo: FakeThreatIntelRepository, overrides: Partial<RiskSignalAggregate>): RiskSignalAggregate {
  // Default signalStartTime is "1 day before real now" rather than a
  // fixed date -- a hardcoded date only stays within any test's 30-day
  // window by coincidence of when the suite happens to run. Tests that
  // pass an explicit `now` to calculateIndustryBenchmark override
  // signalStartTime explicitly too (see below), since a mismatch there
  // is exactly the bug this comment exists to prevent.
  const recentDefault = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const aggregate: RiskSignalAggregate = {
    id: `agg-${Math.random()}`,
    organizationHash: `hash-${Math.random()}`,
    signalType: "deployment_failure",
    industry: "technology",
    signalCount: 5,
    totalDeploymentsCount: 100,
    avgSeverityScore: 0.5,
    maxSeverityScore: 0.6,
    noiseEpsilon: 1.0,
    aggregationWindowHours: 24,
    signalStartTime: recentDefault,
    signalEndTime: new Date(recentDefault.getTime() + 60 * 60 * 1000),
    createdAt: recentDefault,
    ...overrides,
  };
  repo.riskSignalAggregates.push(aggregate);
  return aggregate;
}

test("calculateIndustryBenchmark returns null when fewer than 10 organizations have contributed data (k-anonymity floor)", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 9; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: 0.5 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");
  assert.equal(result, null);
});

test("calculateIndustryBenchmark succeeds at exactly the 10-organization floor", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: 0.5 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");
  assert.notEqual(result, null);
  assert.equal(result?.sampleSize, 10);
});

test("calculateIndustryBenchmark returns null for an industry with no data at all", async () => {
  const repo = new FakeThreatIntelRepository();
  const result = await calculateIndustryBenchmark(repo, "healthcare", "risk_score");
  assert.equal(result, null);
});

test("calculateIndustryBenchmark computes percentiles matching numpy's linear-interpolation formula exactly (hand-verified)", async () => {
  const repo = new FakeThreatIntelRepository();
  // Values 10, 20, ..., 100 (already sorted) across 10 distinct orgs.
  // Hand-computed expected results using numpy's rank = p/100 * (n-1):
  //   p10: rank=0.9  -> 10 + 0.9*(20-10) = 19
  //   p25: rank=2.25 -> 30 + 0.25*(40-30) = 32.5
  //   p50: rank=4.5  -> 50 + 0.5*(60-50) = 55
  //   p75: rank=6.75 -> 70 + 0.75*(80-70) = 77.5
  //   p90: rank=8.1  -> 90 + 0.1*(100-90) = 91
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: (i + 1) * 10 });
  }

  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");

  assert.equal(result?.percentile10, 19);
  assert.equal(result?.percentile25, 32.5);
  assert.equal(result?.percentile50, 55);
  assert.equal(result?.percentile75, 77.5);
  assert.equal(result?.percentile90, 91);
  assert.equal(result?.minValue, 10);
  assert.equal(result?.maxValue, 100);
  assert.equal(result?.meanValue, 55); // (10+20+...+100)/10 = 550/10 = 55
});

test("calculateIndustryBenchmark computes population standard deviation (ddof=0), not sample stddev", async () => {
  const repo = new FakeThreatIntelRepository();
  // Values 10..100: population variance = mean((x-55)^2) for x in [10,20,...,100]
  // = ((-45)^2+(-35)^2+(-25)^2+(-15)^2+(-5)^2+5^2+15^2+25^2+35^2+45^2)/10
  // = (2025+1225+625+225+25+25+225+625+1225+2025)/10 = 8250/10 = 825
  // std = sqrt(825) ~= 28.7228...
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: (i + 1) * 10 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");
  assert.ok(Math.abs((result?.stdDeviation ?? 0) - Math.sqrt(825)) < 1e-9);
});

test("calculateIndustryBenchmark computes deployment_failure_rate as signalCount/totalDeploymentsCount", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, signalCount: 10, totalDeploymentsCount: 100 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "deployment_failure_rate");
  assert.equal(result?.percentile50, 0.1);
});

test("calculateIndustryBenchmark excludes policy_violation_rate values from signals of a different signalType", async () => {
  const repo = new FakeThreatIntelRepository();
  // 10 orgs report deployment_failure signals -- none are policy_violation, so no values qualify.
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, signalType: "deployment_failure" });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "policy_violation_rate");
  assert.equal(result, null, "no policy_violation signals means no valid data points, which fails the floor");
});

test("calculateIndustryBenchmark confidenceScore reaches 1.0 at 50+ distinct orgs, scales linearly below that", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 25; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: 0.5 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");
  assert.equal(result?.confidenceScore, 0.5); // 25/50
});

test("calculateIndustryBenchmark confidenceScore caps at 1.0 even with far more than 50 orgs", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 80; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, avgSeverityScore: 0.5 });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score");
  assert.equal(result?.confidenceScore, 1.0);
});

test("calculateIndustryBenchmark uses the current UTC quarter as the benchmark period label", async () => {
  const repo = new FakeThreatIntelRepository();
  const now = new Date("2026-08-15T00:00:00Z"); // August = Q3
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, signalStartTime: new Date("2026-08-10T00:00:00Z") });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, now);
  assert.equal(result?.benchmarkPeriod, "2026-Q3");
});

test("calculateIndustryBenchmark stores the result, retrievable via getIndustryBenchmark", async () => {
  const repo = new FakeThreatIntelRepository();
  const now = new Date("2026-08-15T00:00:00Z");
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, signalStartTime: new Date("2026-08-10T00:00:00Z") });
  }
  const calculated = await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, now);

  const fetched = await getIndustryBenchmark(repo, "technology", "risk_score", "2026-Q3");
  assert.equal(fetched?.id, calculated?.id);
});

test("calculateIndustryBenchmark respects the time window -- signals outside it don't count toward the sample", async () => {
  const repo = new FakeThreatIntelRepository();
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, {
      organizationHash: `org-hash-${i}`,
      signalStartTime: new Date("2020-01-01T00:00:00Z"), // way outside any reasonable window
    });
  }
  const result = await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, new Date("2026-08-15T00:00:00Z"));
  assert.equal(result, null, "old signals outside the window shouldn't count toward the sample");
});

test("listAllIndustryBenchmarks returns only currently-valid (not expired) benchmarks", async () => {
  const repo = new FakeThreatIntelRepository();
  const now = new Date("2026-08-15T00:00:00Z");
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `org-hash-${i}`, signalStartTime: new Date("2026-08-10T00:00:00Z") });
  }
  await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, now);

  // Manually insert an already-expired benchmark to confirm it's excluded.
  await repo.upsertIndustryBenchmark({
    id: "expired-benchmark",
    industry: "healthcare",
    metric: "risk_score",
    benchmarkPeriod: "2020-Q1",
    percentile10: 0.1,
    percentile25: 0.2,
    percentile50: 0.3,
    percentile75: 0.4,
    percentile90: 0.5,
    meanValue: 0.3,
    stdDeviation: 0.1,
    sampleSize: 10,
    totalDataPoints: 10,
    minValue: 0.1,
    maxValue: 0.5,
    confidenceScore: 0.5,
    dataQualityScore: 0.5,
    calculatedAt: new Date("2020-01-01T00:00:00Z"),
    validUntil: new Date("2020-04-01T00:00:00Z"), // long expired relative to `now`
  });

  const results = await listAllIndustryBenchmarks(repo, {}, now);
  assert.equal(results.length, 1, "the expired healthcare benchmark must be excluded");
  assert.equal(results[0]?.industry, "technology");
});

test("listAllIndustryBenchmarks filters by industry when specified", async () => {
  const repo = new FakeThreatIntelRepository();
  const now = new Date("2026-08-15T00:00:00Z");
  for (let i = 0; i < 10; i++) {
    seedAggregate(repo, { organizationHash: `tech-org-${i}`, industry: "technology", signalStartTime: new Date("2026-08-10T00:00:00Z") });
    seedAggregate(repo, { organizationHash: `health-org-${i}`, industry: "healthcare", signalStartTime: new Date("2026-08-10T00:00:00Z") });
  }
  await calculateIndustryBenchmark(repo, "technology", "risk_score", 30, now);
  await calculateIndustryBenchmark(repo, "healthcare", "risk_score", 30, now);

  const results = await listAllIndustryBenchmarks(repo, { industry: "healthcare" }, now);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.industry, "healthcare");
});
