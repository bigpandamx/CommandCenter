import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuditThreatIntelHandler } from "../src/threatIntelAgent.js";
import { FakeThreatIntelRepository } from "../../Threat-Intelligence/test/fakeRepository.js";
import { createThreatPattern, verifyThreatPattern } from "../../Threat-Intelligence/src/threatPatterns.js";
import { createPromptAbuseSignature } from "../../Threat-Intelligence/src/promptSignatures.js";

function patternInput(overrides: Partial<Parameters<typeof createThreatPattern>[1]> = {}) {
  return {
    patternId: "THREAT-2026-001",
    patternName: "Test Pattern",
    threatType: "prompt_injection" as const,
    severity: "high" as const,
    description: "desc",
    attackVector: "vector",
    detectionSignature: {},
    avgSeverityScore: 0.5,
    ...overrides,
  };
}

test("auditThreatIntel finds nothing when patterns are verified and signatures aren't ready to graduate", async () => {
  const repo = new FakeThreatIntelRepository();
  const oldNow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pattern = await createThreatPattern(repo, patternInput(), oldNow);
  await verifyThreatPattern(repo, pattern.id);

  const handler = createAuditThreatIntelHandler(repo, 14);
  const result = await handler({});

  assert.equal((result.data.unverifiedStalePatternIds as string[]).length, 0);
  assert.equal((result.data.graduationCandidateSignatureIds as string[]).length, 0);
  assert.deepEqual(result.recommendations, []);
});

test("auditThreatIntel flags an active, unverified pattern older than the stale threshold", async () => {
  const repo = new FakeThreatIntelRepository();
  const oldNow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const pattern = await createThreatPattern(repo, patternInput(), oldNow);

  const handler = createAuditThreatIntelHandler(repo, 14);
  const result = await handler({});

  assert.deepEqual(result.data.unverifiedStalePatternIds, [pattern.id]);
  assert.match(result.recommendations.join("\n"), /Test Pattern/);
});

test("auditThreatIntel does not flag a recently-created unverified pattern", async () => {
  const repo = new FakeThreatIntelRepository();
  await createThreatPattern(repo, patternInput()); // created "now"

  const handler = createAuditThreatIntelHandler(repo, 14);
  const result = await handler({});

  assert.equal((result.data.unverifiedStalePatternIds as string[]).length, 0);
});

test("auditThreatIntel flags an experimental signature that has crossed the detection threshold", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await createPromptAbuseSignature(repo, {
    signatureId: "PROMPT-001",
    signatureName: "Test Signature",
    category: "injection",
    detectionLogic: {},
    severity: "medium",
    riskScore: 0.5,
    isExperimental: true,
  });
  // Manually bump totalDetections past the graduation threshold (20),
  // simulating what reportSignatureDetection would do over many calls.
  const stored = await repo.getSignatureById(sig.id);
  await repo.updateSignature({ ...stored!, totalDetections: 25 });

  const handler = createAuditThreatIntelHandler(repo, 14);
  const result = await handler({});

  assert.deepEqual(result.data.graduationCandidateSignatureIds, [sig.id]);
});

test("auditThreatIntel does not flag an experimental signature below the detection threshold", async () => {
  const repo = new FakeThreatIntelRepository();
  await createPromptAbuseSignature(repo, {
    signatureId: "PROMPT-001",
    signatureName: "Test Signature",
    category: "injection",
    detectionLogic: {},
    severity: "medium",
    riskScore: 0.5,
    isExperimental: true,
  });

  const handler = createAuditThreatIntelHandler(repo, 14);
  const result = await handler({});

  assert.equal((result.data.graduationCandidateSignatureIds as string[]).length, 0);
});
