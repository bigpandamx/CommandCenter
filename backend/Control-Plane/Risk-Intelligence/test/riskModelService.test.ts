import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RiskModelError,
  createRiskModel,
  updateRiskModel,
  listRiskModels,
  resolveActiveModelParameters,
} from "../src/riskModelService.js";
import { detectSpike, findRootCause, DEFAULT_SPIKE_PARAMETERS, DEFAULT_ROOT_CAUSE_PARAMETERS } from "../src/detectors.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import type { RiskModelParameters } from "../src/types.js";
import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";

function buildAggregate(overrides: Partial<RiskSignalAggregate> = {}): RiskSignalAggregate {
  return {
    id: randomUUID(),
    industry: "technology",
    signalType: "deployment_failure",
    organizationHash: "hash1",
    signalCount: 10,
    totalDeploymentsCount: 100,
    avgSeverityScore: 0.5,
    maxSeverityScore: 0.6,
    noiseEpsilon: 0.01,
    aggregationWindowHours: 1,
    signalStartTime: new Date(),
    signalEndTime: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

test("createRiskModel rejects an invalid key format", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createRiskModel(repo, { key: "Standard Anomaly!", name: "x", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS }),
    (err: unknown) => err instanceof RiskModelError && err.code === "invalid_key",
  );
});

test("createRiskModel rejects a duplicate key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskModel(repo, { key: "standard-anomaly", name: "x", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });
  await assert.rejects(
    () => createRiskModel(repo, { key: "standard-anomaly", name: "Again", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS }),
    (err: unknown) => err instanceof RiskModelError && err.code === "duplicate_key",
  );
});

test("createRiskModel defaults isActive to false -- a new model doesn't silently start governing production detection", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const model = await createRiskModel(repo, { key: "standard-anomaly", name: "x", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });
  assert.equal(model.isActive, false);
});

test("updateRiskModel rejects changing a model's detector type", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskModel(repo, { key: "standard-anomaly", name: "x", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });
  const trendParams: RiskModelParameters = {
    detectorType: "trend",
    minPoints7d: 3,
    minPoints14d: 5,
    baselineMinimum: 5,
    trendThresholdPct: 10,
    severityHighPct: 30,
    severityMediumPct: 15,
  };
  await assert.rejects(
    () => updateRiskModel(repo, "standard-anomaly", { parameters: trendParams }),
    (err: unknown) => err instanceof RiskModelError && err.code === "detector_type_mismatch",
  );
});

test("updateRiskModel retunes parameters within the same detector type successfully", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskModel(repo, { key: "standard-anomaly", name: "x", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });
  const retuned: RiskModelParameters = { ...DEFAULT_SPIKE_PARAMETERS, spikeThresholdPct: 10 };

  const updated = await updateRiskModel(repo, "standard-anomaly", { parameters: retuned, isActive: true });

  assert.equal(updated.parameters.detectorType === "anomaly" && updated.parameters.spikeThresholdPct, 10);
  assert.equal(updated.isActive, true);
});

test("updateRiskModel throws risk_model_not_found for an unknown key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => updateRiskModel(repo, "ghost-model", { isActive: true }),
    (err: unknown) => err instanceof RiskModelError && err.code === "risk_model_not_found",
  );
});

test("listRiskModels orders by name", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskModel(repo, { key: "z-model", name: "Z Model", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });
  await createRiskModel(repo, { key: "a-model", name: "A Model", description: "x", parameters: DEFAULT_SPIKE_PARAMETERS });

  const models = await listRiskModels(repo);
  assert.deepEqual(models.map((m) => m.key), ["a-model", "z-model"]);
});

// --- resolveActiveModelParameters ---

test("resolveActiveModelParameters falls back to the detector's own hardcoded default when nothing is configured -- an ordinary state", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const params = await resolveActiveModelParameters(repo, "anomaly");
  assert.deepEqual(params, DEFAULT_SPIKE_PARAMETERS);
});

test("resolveActiveModelParameters returns the active model's own parameters when one is configured and active", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const retuned: RiskModelParameters = { ...DEFAULT_SPIKE_PARAMETERS, spikeThresholdPct: 5 };
  await createRiskModel(repo, { key: "sensitive-anomaly", name: "x", description: "x", parameters: retuned, isActive: true });

  const params = await resolveActiveModelParameters(repo, "anomaly");

  assert.equal(params.detectorType === "anomaly" && params.spikeThresholdPct, 5);
});

test("resolveActiveModelParameters ignores an inactive model, falling back to the default", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const retuned: RiskModelParameters = { ...DEFAULT_SPIKE_PARAMETERS, spikeThresholdPct: 5 };
  await createRiskModel(repo, { key: "sensitive-anomaly", name: "x", description: "x", parameters: retuned, isActive: false });

  const params = await resolveActiveModelParameters(repo, "anomaly");

  assert.deepEqual(params, DEFAULT_SPIKE_PARAMETERS);
});

// --- The key proof: a configured model genuinely changes detector output ---

test("a stricter (lower) spike threshold configured on a model causes detectSpike to fire where the default would not", () => {
  // ~15% jump -- below the default 20% threshold, so the default should NOT flag it, but a custom, more sensitive 10% threshold should.
  const aggregates24h = Array.from({ length: 20 }, (_, i) =>
    buildAggregate({ avgSeverityScore: 0.1, signalStartTime: new Date(Date.now() - (i + 2) * 60 * 60 * 1000) }),
  );
  const aggregates1h = [buildAggregate({ avgSeverityScore: 0.115 }), buildAggregate({ avgSeverityScore: 0.115 })];

  const withDefault = detectSpike("technology", aggregates1h, aggregates24h, new Date());
  assert.equal(withDefault, null, "a ~15% jump should NOT trigger the default 20% threshold");

  const sensitiveParams: RiskModelParameters = { ...DEFAULT_SPIKE_PARAMETERS, spikeThresholdPct: 10 };
  const withCustomModel = detectSpike("technology", aggregates1h, aggregates24h, new Date(), sensitiveParams);
  assert.notEqual(withCustomModel, null, "the same ~15% jump SHOULD trigger a custom, more sensitive 10% threshold");
});

test("a stricter dominance threshold configured on a model prevents findRootCause from firing where the default would", () => {
  // 70% dominance -- above the default 65% threshold, so the default SHOULD flag it, but a stricter custom 80% threshold should not.
  const aggregates24h = [
    ...Array.from({ length: 7 }, () => buildAggregate({ signalType: "prompt_injection", avgSeverityScore: 0.6 })),
    ...Array.from({ length: 3 }, () => buildAggregate({ signalType: "data_leakage", avgSeverityScore: 0.6 })),
  ];

  const withDefault = findRootCause("technology", aggregates24h, new Date());
  assert.notEqual(withDefault, null, "70% dominance should trigger the default 65% threshold");

  const stricterParams: RiskModelParameters = { ...DEFAULT_ROOT_CAUSE_PARAMETERS, dominanceThresholdPct: 80 };
  const withCustomModel = findRootCause("technology", aggregates24h, new Date(), stricterParams);
  assert.equal(withCustomModel, null, "the same 70% dominance should NOT trigger a stricter, custom 80% threshold");
});
