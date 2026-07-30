import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  computeExposure,
  generateRiskAssessmentSnapshot,
  generateRiskAssessmentSnapshotsForAllIndustries,
  listRiskAssessmentHistory,
  getLatestRiskAssessment,
} from "../src/riskAssessmentService.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import type { NetworkRiskInsight } from "../src/types.js";

function buildInsight(overrides: Partial<NetworkRiskInsight> = {}): NetworkRiskInsight {
  return {
    id: randomUUID(),
    industry: "technology",
    type: "anomaly",
    severity: "medium",
    summary: "x",
    explanation: "x",
    contributingFactors: {},
    recommendation: "x",
    confidence: 1,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

// --- computeExposure (pure scoring formula) ---

test("computeExposure returns zero/low for no insights at all", () => {
  const { score, level } = computeExposure([]);
  assert.equal(score, 0);
  assert.equal(level, "low");
});

test("computeExposure weights severity correctly -- critical contributes more than low", () => {
  const critical = computeExposure([buildInsight({ severity: "critical", confidence: 1 })]);
  const low = computeExposure([buildInsight({ severity: "low", confidence: 1 })]);
  assert.equal(critical.score, 4);
  assert.equal(low.score, 1);
  assert.ok(critical.score > low.score);
});

test("computeExposure weights by confidence -- a low-confidence critical detection counts less than a high-confidence one", () => {
  const highConfidence = computeExposure([buildInsight({ severity: "critical", confidence: 1.0 })]);
  const lowConfidence = computeExposure([buildInsight({ severity: "critical", confidence: 0.5 })]);
  assert.equal(highConfidence.score, 4);
  assert.equal(lowConfidence.score, 2);
});

test("computeExposure sums across multiple insights, not just the worst one", () => {
  const { score } = computeExposure([
    buildInsight({ severity: "medium", confidence: 1 }),
    buildInsight({ severity: "medium", confidence: 1 }),
    buildInsight({ severity: "medium", confidence: 1 }),
  ]);
  assert.equal(score, 6, "three medium insights (2 each) should sum to 6, not just report one medium's worth");
});

test("computeExposure's level bands: low, medium, high, critical in the right order", () => {
  assert.equal(computeExposure([]).level, "low");
  assert.equal(computeExposure([buildInsight({ severity: "critical", confidence: 1 })]).level, "medium"); // score 4
  assert.equal(
    computeExposure([buildInsight({ severity: "critical", confidence: 1 }), buildInsight({ severity: "critical", confidence: 1 })]).level,
    "high",
  ); // score 8
  assert.equal(
    computeExposure(Array.from({ length: 4 }, () => buildInsight({ severity: "critical", confidence: 1 }))).level,
    "critical",
  ); // score 16
});

// --- generateRiskAssessmentSnapshot ---

test("generateRiskAssessmentSnapshot only counts UNRESOLVED insights toward the score", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const resolved = buildInsight({ severity: "critical", confidence: 1, isResolved: true });
  const unresolved = buildInsight({ severity: "low", confidence: 1, isResolved: false });
  await repo.createInsight(resolved);
  await repo.createInsight(unresolved);

  const assessment = await generateRiskAssessmentSnapshot(repo, "technology");

  assert.equal(assessment.exposureScore, 1, "only the unresolved low-severity insight should count, not the resolved critical one");
  assert.deepEqual(assessment.contributingInsightIds, [unresolved.id]);
});

test("generateRiskAssessmentSnapshot only counts insights in the given industry", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await repo.createInsight(buildInsight({ industry: "technology", severity: "critical", confidence: 1 }));
  await repo.createInsight(buildInsight({ industry: "healthcare", severity: "critical", confidence: 1 }));

  const assessment = await generateRiskAssessmentSnapshot(repo, "technology");

  assert.equal(assessment.exposureScore, 4, "only the technology insight should count");
});

test("generateRiskAssessmentSnapshot persists the snapshot, retrievable as the latest", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await repo.createInsight(buildInsight({ severity: "high", confidence: 1 }));

  const created = await generateRiskAssessmentSnapshot(repo, "technology");
  const latest = await getLatestRiskAssessment(repo, "technology");

  assert.equal(latest?.id, created.id);
});

test("getLatestRiskAssessment returns null for an industry with no snapshots yet", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const latest = await getLatestRiskAssessment(repo, "technology");
  assert.equal(latest, null);
});

test("listRiskAssessmentHistory returns snapshots newest first -- the trend view", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await repo.createInsight(buildInsight({ severity: "low", confidence: 1 }));

  const first = await generateRiskAssessmentSnapshot(repo, "technology", new Date("2026-07-01T00:00:00Z"));
  const second = await generateRiskAssessmentSnapshot(repo, "technology", new Date("2026-07-15T00:00:00Z"));

  const history = await listRiskAssessmentHistory(repo, "technology");

  assert.deepEqual(history.map((a) => a.id), [second.id, first.id]);
});

// --- generateRiskAssessmentSnapshotsForAllIndustries ---

test("generateRiskAssessmentSnapshotsForAllIndustries snapshots every distinct industry that has ever had an insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await repo.createInsight(buildInsight({ industry: "technology" }));
  await repo.createInsight(buildInsight({ industry: "healthcare" }));

  const results = await generateRiskAssessmentSnapshotsForAllIndustries(repo);

  assert.equal(results.length, 2);
  assert.deepEqual(new Set(results.map((r) => r.industry)), new Set(["technology", "healthcare"]));
  assert.ok(results.every((r) => r.status === "success"));
});

test("generateRiskAssessmentSnapshotsForAllIndustries still snapshots an industry whose only insight is now resolved -- zero exposure, not silently dropped from tracking", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await repo.createInsight(buildInsight({ industry: "technology", isResolved: true }));

  const results = await generateRiskAssessmentSnapshotsForAllIndustries(repo);

  assert.equal(results.length, 1);
  const snapshot = await getLatestRiskAssessment(repo, "technology");
  assert.equal(snapshot?.exposureScore, 0);
  assert.equal(snapshot?.exposureLevel, "low");
});

test("generateRiskAssessmentSnapshotsForAllIndustries returns an empty array when no insights have ever been created", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const results = await generateRiskAssessmentSnapshotsForAllIndustries(repo);
  assert.deepEqual(results, []);
});
