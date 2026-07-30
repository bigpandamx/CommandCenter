import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RiskFactorError,
  createRiskFactor,
  listRiskFactors,
  classifyInsight,
  declassifyInsight,
  listRiskFactorsForInsight,
  computeRiskFactorSummary,
  listInsightsClassifiedUnderRiskFactor,
} from "../src/riskFactorService.js";
import type { NetworkRiskInsight } from "../src/types.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";

function buildInsight(overrides: Partial<NetworkRiskInsight> = {}): NetworkRiskInsight {
  return {
    id: randomUUID(),
    industry: "technology",
    type: "anomaly",
    severity: "high",
    summary: "Risk signals spiking",
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

test("createRiskFactor rejects an invalid key format", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createRiskFactor(repo, { key: "AI Model Risk!", name: "x", description: "x" }),
    (err: unknown) => err instanceof RiskFactorError && err.code === "invalid_key",
  );
});

test("createRiskFactor rejects a duplicate key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });
  await assert.rejects(
    () => createRiskFactor(repo, { key: "ai-model-risk", name: "Again", description: "x" }),
    (err: unknown) => err instanceof RiskFactorError && err.code === "duplicate_key",
  );
});

test("classifyInsight throws risk_factor_not_found / insight_not_found appropriately", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });
  const insight = buildInsight();
  await repo.createInsight(insight);

  await assert.rejects(
    () => classifyInsight(repo, "ghost-insight", factor.key),
    (err: unknown) => err instanceof RiskFactorError && err.code === "insight_not_found",
  );
  await assert.rejects(
    () => classifyInsight(repo, insight.id, "ghost-factor"),
    (err: unknown) => err instanceof RiskFactorError && err.code === "risk_factor_not_found",
  );
});

test("the worked example: an insight is classified under multiple risk factors, listed and declassifiable", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const modelRisk = await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });
  const vendorRisk = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const insight = buildInsight();
  await repo.createInsight(insight);

  await classifyInsight(repo, insight.id, modelRisk.key);
  await classifyInsight(repo, insight.id, vendorRisk.key);

  const factors = await listRiskFactorsForInsight(repo, insight.id);
  assert.equal(factors.length, 2);
  assert.deepEqual(new Set(factors.map((f) => f.key)), new Set(["ai-model-risk", "vendor-risk"]));

  await declassifyInsight(repo, insight.id, modelRisk.key);
  const afterDeclassify = await listRiskFactorsForInsight(repo, insight.id);
  assert.equal(afterDeclassify.length, 1);
  assert.equal(afterDeclassify[0]!.key, "vendor-risk");
});

test("listRiskFactors orders by name", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });

  const factors = await listRiskFactors(repo);
  assert.deepEqual(factors.map((f) => f.key), ["ai-model-risk", "vendor-risk"]);
});

// --- computeRiskFactorSummary: prevalence, not completeness ---

test("computeRiskFactorSummary reports zero for a factor with nothing classified under it yet -- an ordinary state, not a gap", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });

  const summary = await computeRiskFactorSummary(repo, factor.key);

  assert.equal(summary.totalLinkedInsights, 0);
  assert.equal(summary.unresolvedLinkedInsights, 0);
});

test("computeRiskFactorSummary counts total vs. unresolved separately -- prevalence vs. current active exposure", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });
  const resolved = buildInsight({ isResolved: true });
  const unresolved1 = buildInsight({ isResolved: false });
  const unresolved2 = buildInsight({ isResolved: false });
  await repo.createInsight(resolved);
  await repo.createInsight(unresolved1);
  await repo.createInsight(unresolved2);
  await classifyInsight(repo, resolved.id, factor.key);
  await classifyInsight(repo, unresolved1.id, factor.key);
  await classifyInsight(repo, unresolved2.id, factor.key);

  const summary = await computeRiskFactorSummary(repo, factor.key);

  assert.equal(summary.totalLinkedInsights, 3, "prevalence counts every linked insight, resolved or not");
  assert.equal(summary.unresolvedLinkedInsights, 2, "active exposure counts only the still-unresolved ones");
});

test("computeRiskFactorSummary only counts insights actually classified under THIS factor, not every insight that exists", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const modelRisk = await createRiskFactor(repo, { key: "ai-model-risk", name: "AI Model Risk", description: "x" });
  const vendorRisk = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const insight = buildInsight();
  await repo.createInsight(insight);
  await classifyInsight(repo, insight.id, vendorRisk.key); // classified under vendor risk, NOT model risk

  const modelRiskSummary = await computeRiskFactorSummary(repo, modelRisk.key);

  assert.equal(modelRiskSummary.totalLinkedInsights, 0);
});

test("computeRiskFactorSummary throws risk_factor_not_found for an unknown key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => computeRiskFactorSummary(repo, "ghost-factor"),
    (err: unknown) => err instanceof RiskFactorError && err.code === "risk_factor_not_found",
  );
});

// --- listInsightsClassifiedUnderRiskFactor: the full records, not just summary counts ---

test("listInsightsClassifiedUnderRiskFactor returns the full insight records classified under a factor", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const insight = buildInsight({ summary: "OpenAI outage" });
  await repo.createInsight(insight);
  await classifyInsight(repo, insight.id, factor.key);

  const insights = await listInsightsClassifiedUnderRiskFactor(repo, factor.key);

  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.summary, "OpenAI outage");
});

test("listInsightsClassifiedUnderRiskFactor returns an empty array for a factor with nothing classified yet", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });

  const insights = await listInsightsClassifiedUnderRiskFactor(repo, factor.key);

  assert.deepEqual(insights, []);
});

test("listInsightsClassifiedUnderRiskFactor throws risk_factor_not_found for an unknown key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => listInsightsClassifiedUnderRiskFactor(repo, "ghost-factor"),
    (err: unknown) => err instanceof RiskFactorError && err.code === "risk_factor_not_found",
  );
});
