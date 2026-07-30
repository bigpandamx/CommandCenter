import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createThreatPattern,
  verifyThreatPattern,
  markThreatPatternFalsePositive,
  setThreatPatternActive,
  ThreatPatternError,
} from "../src/threatPatterns.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

function baseInput(overrides: Partial<Parameters<typeof createThreatPattern>[1]> = {}) {
  return {
    patternId: "THREAT-2026-001",
    patternName: "Instruction Override Attempt",
    threatType: "prompt_injection" as const,
    severity: "high" as const,
    description: "User attempts to override system instructions.",
    attackVector: "Prompt contains phrases like 'ignore previous instructions'.",
    detectionSignature: { keywords: ["ignore previous instructions"] },
    avgSeverityScore: 0.75,
    ...overrides,
  };
}

test("createThreatPattern defaults confidenceThreshold, timestamps, and lifecycle flags", async () => {
  const repo = new FakeThreatIntelRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const pattern = await createThreatPattern(repo, baseInput(), now);

  assert.equal(pattern.confidenceThreshold, 0.8);
  assert.equal(pattern.isActive, true);
  assert.equal(pattern.isFalsePositive, false);
  assert.equal(pattern.verifiedByAnalyst, false);
  assert.equal(pattern.totalObservations, 0);
  assert.equal(pattern.firstObserved.toISOString(), now.toISOString());
  assert.equal(pattern.lastObserved.toISOString(), now.toISOString());
});

test("createThreatPattern rejects a duplicate patternId", async () => {
  const repo = new FakeThreatIntelRepository();
  await createThreatPattern(repo, baseInput());
  await assert.rejects(
    () => createThreatPattern(repo, baseInput()),
    (err: unknown) => err instanceof ThreatPatternError && err.code === "duplicate_pattern_id",
  );
});

test("createThreatPattern rejects an empty patternId", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => createThreatPattern(repo, baseInput({ patternId: "  " })),
    (err: unknown) => err instanceof ThreatPatternError && err.code === "invalid_input",
  );
});

test("createThreatPattern rejects avgSeverityScore outside [0,1]", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => createThreatPattern(repo, baseInput({ avgSeverityScore: 1.5 })),
    (err: unknown) => err instanceof ThreatPatternError && err.code === "invalid_input",
  );
});

test("createThreatPattern rejects confidenceThreshold outside [0,1]", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => createThreatPattern(repo, baseInput({ confidenceThreshold: -0.1 })),
    (err: unknown) => err instanceof ThreatPatternError && err.code === "invalid_input",
  );
});

test("verifyThreatPattern sets verifiedByAnalyst without touching isActive", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, baseInput());
  const updated = await verifyThreatPattern(repo, pattern.id);
  assert.equal(updated.verifiedByAnalyst, true);
  assert.equal(updated.isActive, true);
});

test("markThreatPatternFalsePositive sets isFalsePositive AND deactivates the pattern", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, baseInput());
  const updated = await markThreatPatternFalsePositive(repo, pattern.id);
  assert.equal(updated.isFalsePositive, true);
  assert.equal(updated.isActive, false, "a confirmed false positive must not stay active");
});

test("setThreatPatternActive can reactivate a deactivated pattern", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, baseInput());
  await setThreatPatternActive(repo, pattern.id, false);
  const reactivated = await setThreatPatternActive(repo, pattern.id, true);
  assert.equal(reactivated.isActive, true);
});

test("verifyThreatPattern throws for an unknown pattern", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => verifyThreatPattern(repo, "ghost-pattern"),
    (err: unknown) => err instanceof ThreatPatternError && err.code === "pattern_not_found",
  );
});
