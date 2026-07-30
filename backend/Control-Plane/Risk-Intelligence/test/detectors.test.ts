import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSpike, analyzeTrend, findRootCause, detectCorrelation } from "../src/detectors.js";
import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";

let counter = 0;
function aggregate(overrides: Partial<RiskSignalAggregate>): RiskSignalAggregate {
  counter += 1;
  return {
    id: `agg-${counter}`,
    organizationHash: `org-hash-${counter}`,
    signalType: "deployment_failure",
    industry: "technology",
    signalCount: 5,
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

test("detectSpike returns null with fewer than 2 points in the 1h window", () => {
  const result = detectSpike(
    "technology",
    [aggregate({ avgSeverityScore: 0.5, signalStartTime: new Date("2026-07-20T11:45:00Z") })],
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectSpike returns null with fewer than 5 points in the 24h window", () => {
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.5, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 4 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectSpike returns null when the prior baseline is below 5 (avoids flagging noise near zero)", () => {
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.5, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.02, signalStartTime: new Date("2026-07-20T09:00:00Z") })), // riskIndex 2, below floor of 5
    NOW,
  );
  assert.equal(result, null);
});

test("detectSpike returns null just under the 20% threshold (19% change)", () => {
  // avgPrior riskIndex = 10 (score 0.10), avg1h riskIndex = 11.9 (score 0.119) => 19% change
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.119, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectSpike triggers at exactly the 20% threshold", () => {
  // avgPrior riskIndex = 10, avg1h riskIndex = 12 => exactly 20% change
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.12, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.notEqual(result, null);
  assert.equal(result?.type, "anomaly");
  assert.equal(result?.severity, "medium"); // 20% is not >30%, so medium
});

test("detectSpike severity escalates to critical above 50% change", () => {
  // avgPrior = 10, avg1h = 16 => 60% change
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.16, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.equal(result?.severity, "critical");
});

test("detectSpike returns null when risk decreased, not increased", () => {
  const result = detectSpike(
    "technology",
    Array.from({ length: 2 }, () => aggregate({ avgSeverityScore: 0.05, signalStartTime: new Date("2026-07-20T11:45:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-20T09:00:00Z") })),
    NOW,
  );
  assert.equal(result, null);
});

test("analyzeTrend returns null just under the 10% threshold", () => {
  // avgPrevWeek=10, avgThisWeek=10.9 => 9% change
  const result = analyzeTrend(
    "technology",
    Array.from({ length: 3 }, () => aggregate({ avgSeverityScore: 0.109, signalStartTime: new Date("2026-07-19T00:00:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-05T00:00:00Z") })),
    NOW,
  );
  assert.equal(result, null);
});

test("analyzeTrend triggers at just over the 10% threshold and reports the correct direction", () => {
  // avgPrevWeek=10, avgThisWeek=11.5 => 15% increase
  const result = analyzeTrend(
    "technology",
    Array.from({ length: 3 }, () => aggregate({ avgSeverityScore: 0.115, signalStartTime: new Date("2026-07-19T00:00:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-05T00:00:00Z") })),
    NOW,
  );
  assert.notEqual(result, null);
  assert.equal(result?.type, "trend");
  assert.equal(result?.contributingFactors.direction, "increasing");
});

test("analyzeTrend detects a decreasing trend correctly", () => {
  // avgPrevWeek=10, avgThisWeek=8 => -20% change
  const result = analyzeTrend(
    "technology",
    Array.from({ length: 3 }, () => aggregate({ avgSeverityScore: 0.08, signalStartTime: new Date("2026-07-19T00:00:00Z") })),
    Array.from({ length: 5 }, () => aggregate({ avgSeverityScore: 0.1, signalStartTime: new Date("2026-07-05T00:00:00Z") })),
    NOW,
  );
  assert.equal(result?.contributingFactors.direction, "decreasing");
  assert.equal(result?.severity, "medium"); // 20% is between 15 and 30
});

test("findRootCause returns null when no signal type reaches 65% dominance", () => {
  const result = findRootCause("technology", [
    aggregate({ signalType: "deployment_failure", signalCount: 40 }),
    aggregate({ signalType: "policy_violation", signalCount: 30 }),
    aggregate({ signalType: "audit_anomaly", signalCount: 30 }),
    aggregate({ signalType: "prompt_injection", signalCount: 20 }),
    aggregate({ signalType: "data_leakage", signalCount: 10 }),
  ], NOW);
  assert.equal(result, null); // deployment_failure is 40/130 = 30.7%, well under 65%
});

test("findRootCause triggers when one signal type exceeds 65% of total volume", () => {
  const result = findRootCause("technology", [
    aggregate({ signalType: "deployment_failure", signalCount: 70 }),
    aggregate({ signalType: "policy_violation", signalCount: 10 }),
    aggregate({ signalType: "audit_anomaly", signalCount: 10 }),
    aggregate({ signalType: "prompt_injection", signalCount: 5 }),
    aggregate({ signalType: "data_leakage", signalCount: 5 }),
  ], NOW);
  assert.notEqual(result, null);
  assert.equal(result?.contributingFactors.dominantSignalType, "deployment_failure");
});

test("findRootCause severity follows the avg-score bands (>=80 critical, >=60 high, >=40 medium, else low)", () => {
  const result = findRootCause(
    "technology",
    Array.from({ length: 5 }, (_, i) =>
      aggregate({ signalType: "deployment_failure", signalCount: 100, avgSeverityScore: 0.85 - i * 0.001 }),
    ),
    NOW,
  );
  assert.equal(result?.severity, "critical");
});

test("detectCorrelation returns null with fewer than 10 aggregates", () => {
  const result = detectCorrelation(
    "technology",
    Array.from({ length: 9 }, () => aggregate({ avgSeverityScore: 0.9, organizationHash: "same-org" })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectCorrelation returns null when avg risk index is below 50", () => {
  const result = detectCorrelation(
    "technology",
    Array.from({ length: 10 }, () => aggregate({ avgSeverityScore: 0.3, organizationHash: "same-org" })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectCorrelation returns null when concentration is below 60%", () => {
  // 10 aggregates spread across 10 distinct orgs -- no concentration at all.
  const result = detectCorrelation(
    "technology",
    Array.from({ length: 10 }, (_, i) => aggregate({ avgSeverityScore: 0.9, organizationHash: `org-${i}` })),
    NOW,
  );
  assert.equal(result, null);
});

test("detectCorrelation triggers when >=60% of signals concentrate on one org and avg risk is elevated", () => {
  const concentrated = Array.from({ length: 7 }, () => aggregate({ avgSeverityScore: 0.9, organizationHash: "org-heavy" }));
  const spread = Array.from({ length: 3 }, (_, i) => aggregate({ avgSeverityScore: 0.9, organizationHash: `org-other-${i}` }));
  const result = detectCorrelation("technology", [...concentrated, ...spread], NOW);

  assert.notEqual(result, null);
  assert.equal(result?.contributingFactors.concentrationPct, 70);
  // Only a hash prefix is exposed, never the full hash.
  assert.equal(result?.contributingFactors.topOrganizationHashPrefix, "org-heav".slice(0, 8));
});

test("detectCorrelation severity is high at avg risk >=70, medium otherwise", () => {
  const concentrated = Array.from({ length: 10 }, () => aggregate({ avgSeverityScore: 0.75, organizationHash: "org-heavy" }));
  const result = detectCorrelation("technology", concentrated, NOW);
  assert.equal(result?.severity, "high");
});
