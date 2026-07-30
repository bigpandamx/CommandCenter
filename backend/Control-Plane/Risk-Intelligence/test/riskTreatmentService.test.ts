import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RiskTreatmentError,
  proposeRiskTreatment,
  listTreatmentsForInsight,
  listRiskTreatments,
  updateTreatmentStatus,
} from "../src/riskTreatmentService.js";
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
    confidence: 0.85,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

test("proposeRiskTreatment throws insight_not_found for an unknown insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => proposeRiskTreatment(repo, { insightId: "ghost-insight", treatmentType: "mitigate", description: "x", proposedByStaffId: "staff-1" }),
    (err: unknown) => err instanceof RiskTreatmentError && err.code === "insight_not_found",
  );
});

// --- The load-bearing distinction: "accept" is a genuine, complete outcome ---

test("an 'accept' treatment is immediately status 'completed' -- the decision IS the completed action, not the start of one", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);

  const treatment = await proposeRiskTreatment(repo, {
    insightId: insight.id,
    treatmentType: "accept",
    description: "Blast radius is small; accepting this risk as-is.",
    proposedByStaffId: "staff-1",
  });

  assert.equal(treatment.status, "completed");
  assert.ok(treatment.completedAt, "an accepted risk has a completion timestamp immediately, not null");
});

test("a 'mitigate' treatment starts as 'proposed', not 'completed' -- real work hasn't happened just because it was proposed", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);

  const treatment = await proposeRiskTreatment(repo, {
    insightId: insight.id,
    treatmentType: "mitigate",
    description: "Rotate affected API credentials.",
    proposedByStaffId: "staff-1",
  });

  assert.equal(treatment.status, "proposed");
  assert.equal(treatment.completedAt, null);
});

test("'avoid' and 'transfer' also start as 'proposed', not 'completed' -- only 'accept' gets the immediate-completion treatment", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);

  const avoid = await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "avoid", description: "x", proposedByStaffId: "staff-1" });
  const transfer = await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "transfer", description: "x", proposedByStaffId: "staff-1" });

  assert.equal(avoid.status, "proposed");
  assert.equal(transfer.status, "proposed");
});

// --- Normal status flow ---

test("updateTreatmentStatus moves a treatment from proposed to in_progress to completed", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);
  const treatment = await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "mitigate", description: "x", proposedByStaffId: "staff-1" });

  const inProgress = await updateTreatmentStatus(repo, treatment.id, "in_progress");
  assert.equal(inProgress.status, "in_progress");
  assert.equal(inProgress.completedAt, null);

  const completed = await updateTreatmentStatus(repo, treatment.id, "completed");
  assert.equal(completed.status, "completed");
  assert.ok(completed.completedAt);
});

test("updateTreatmentStatus does not overwrite an existing completedAt when re-marked completed", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);
  const treatment = await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "mitigate", description: "x", proposedByStaffId: "staff-1" });

  const firstCompletion = await updateTreatmentStatus(repo, treatment.id, "completed", new Date("2026-07-01T00:00:00Z"));
  const secondCall = await updateTreatmentStatus(repo, treatment.id, "completed", new Date("2026-08-01T00:00:00Z"));

  assert.equal(secondCall.completedAt?.getTime(), firstCompletion.completedAt?.getTime());
});

test("updateTreatmentStatus throws treatment_not_found for an unknown treatment", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => updateTreatmentStatus(repo, "ghost-treatment", "in_progress"),
    (err: unknown) => err instanceof RiskTreatmentError && err.code === "treatment_not_found",
  );
});

// --- Zero treatments is ordinary, not a gap ---

test("an insight with zero treatments returns an empty list, not an error", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);

  const treatments = await listTreatmentsForInsight(repo, insight.id);

  assert.deepEqual(treatments, []);
});

test("listTreatmentsForInsight throws insight_not_found for an unknown insight, distinguishing 'no insight' from 'no treatments'", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => listTreatmentsForInsight(repo, "ghost-insight"),
    (err: unknown) => err instanceof RiskTreatmentError && err.code === "insight_not_found",
  );
});

test("an insight can have multiple treatments proposed against it", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);
  await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "mitigate", description: "x", proposedByStaffId: "staff-1" });
  await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "transfer", description: "x", proposedByStaffId: "staff-2" });

  const treatments = await listTreatmentsForInsight(repo, insight.id);

  assert.equal(treatments.length, 2);
});

// --- General browsing ---

test("listRiskTreatments filters by treatmentType and status", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const insight = buildInsight();
  await repo.createInsight(insight);
  await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "accept", description: "x", proposedByStaffId: "staff-1" });
  await proposeRiskTreatment(repo, { insightId: insight.id, treatmentType: "mitigate", description: "x", proposedByStaffId: "staff-1" });

  const accepted = await listRiskTreatments(repo, { treatmentType: "accept" });
  const proposed = await listRiskTreatments(repo, { status: "proposed" });

  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.treatmentType, "accept");
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0]?.treatmentType, "mitigate");
});
