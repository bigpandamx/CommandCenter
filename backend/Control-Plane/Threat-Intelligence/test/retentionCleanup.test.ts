import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupExpiredData } from "../src/retentionCleanup.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";
import type { RiskSignalAggregate } from "../src/riskSignals.js";
import type { DataSharingLogEntry } from "../src/observations.js";

const NOW = new Date("2026-07-20T12:00:00Z");

function aggregate(signalStartTime: Date): RiskSignalAggregate {
  return {
    id: `agg-${Math.random()}`,
    organizationHash: "hash",
    signalType: "deployment_failure",
    industry: "technology",
    signalCount: 5,
    totalDeploymentsCount: 100,
    avgSeverityScore: 0.5,
    maxSeverityScore: 0.5,
    noiseEpsilon: 1.0,
    aggregationWindowHours: 24,
    signalStartTime,
    signalEndTime: signalStartTime,
    createdAt: signalStartTime,
  };
}

function sharingLog(retentionUntil: Date): DataSharingLogEntry {
  return {
    id: `log-${Math.random()}`,
    organizationId: "org-1",
    organizationHash: "hash",
    dataType: "threat_observation",
    recordCount: 1,
    anonymizationApplied: true,
    differentialPrivacyApplied: false,
    consentVersion: "v1.0",
    sharingPurpose: "threat_intelligence",
    retentionUntil,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    deletedAt: null,
  };
}

test("cleanupExpiredData hard-deletes risk signal aggregates older than 2 years", async () => {
  const repo = new FakeThreatIntelRepository();
  repo.riskSignalAggregates.push(aggregate(new Date("2020-01-01T00:00:00Z"))); // way older than 2 years
  repo.riskSignalAggregates.push(aggregate(new Date("2026-07-01T00:00:00Z"))); // recent

  const result = await cleanupExpiredData(repo, NOW);

  assert.equal(result.success, true);
  assert.equal(result.aggregatesDeleted, 1);
  assert.equal(repo.riskSignalAggregates.length, 1);
  assert.equal(repo.riskSignalAggregates[0]?.signalStartTime.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("cleanupExpiredData soft-deletes expired sharing logs without removing them", async () => {
  const repo = new FakeThreatIntelRepository();
  repo.dataSharingLogs.push(sharingLog(new Date("2026-01-01T00:00:00Z"))); // expired (before NOW)
  repo.dataSharingLogs.push(sharingLog(new Date("2027-01-01T00:00:00Z"))); // not yet expired

  const result = await cleanupExpiredData(repo, NOW);

  assert.equal(result.sharingLogsSoftDeleted, 1);
  assert.equal(repo.dataSharingLogs.length, 2, "soft-deleted logs must still be present, not removed");
  const expired = repo.dataSharingLogs.find((l) => l.retentionUntil.getTime() < NOW.getTime());
  assert.ok(expired?.deletedAt, "expired log must be marked deletedAt");
  const notExpired = repo.dataSharingLogs.find((l) => l.retentionUntil.getTime() > NOW.getTime());
  assert.equal(notExpired?.deletedAt, null);
});

test("cleanupExpiredData does not re-mark an already-soft-deleted log", async () => {
  const repo = new FakeThreatIntelRepository();
  const alreadyDeleted = sharingLog(new Date("2026-01-01T00:00:00Z"));
  alreadyDeleted.deletedAt = new Date("2026-06-01T00:00:00Z");
  repo.dataSharingLogs.push(alreadyDeleted);

  const result = await cleanupExpiredData(repo, NOW);

  assert.equal(result.sharingLogsSoftDeleted, 0, "an already-deleted log shouldn't be counted again");
});

test("cleanupExpiredData with no expired data returns zero counts and still succeeds", async () => {
  const repo = new FakeThreatIntelRepository();
  const result = await cleanupExpiredData(repo, NOW);
  assert.equal(result.success, true);
  assert.equal(result.aggregatesDeleted, 0);
  assert.equal(result.sharingLogsSoftDeleted, 0);
});
