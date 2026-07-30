import { test } from "node:test";
import assert from "node:assert/strict";
import { createPromptAbuseSignature } from "../src/promptSignatures.js";
import { reportSignatureDetection } from "../src/signatureDetections.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

const SALT = "test-salt";

async function seedSignature(repo: FakeThreatIntelRepository) {
  return createPromptAbuseSignature(repo, {
    signatureId: "PROMPT-2026-001",
    signatureName: "Test Signature",
    category: "injection",
    detectionLogic: {},
    severity: "medium",
    riskScore: 0.5,
  });
}

test("reportSignatureDetection is rejected for an unknown signatureId, without throwing", async () => {
  const repo = new FakeThreatIntelRepository();
  const result = await reportSignatureDetection(repo, { signatureId: "GHOST" }, SALT);
  assert.deepEqual(result, { accepted: false, reason: "signature_not_found" });
});

test("reportSignatureDetection increments totalDetections and sets lastDetection -- closing the real gap where these fields existed but nothing set them", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await seedSignature(repo);
  assert.equal(sig.totalDetections, 0);
  assert.equal(sig.lastDetection, null);

  const now = new Date("2026-07-20T12:00:00Z");
  const result = await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001" }, SALT, now);

  assert.deepEqual(result, { accepted: true });
  const updated = await repo.getSignatureById(sig.id);
  assert.equal(updated?.totalDetections, 1);
  assert.equal(updated?.lastDetection?.toISOString(), now.toISOString());
});

test("reportSignatureDetection accumulates totalDetections across multiple reports", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await seedSignature(repo);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001" }, SALT);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001" }, SALT);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001" }, SALT);

  const updated = await repo.getSignatureById(sig.id);
  assert.equal(updated?.totalDetections, 3);
});

test("reportSignatureDetection works without an organizationId (org context is optional, unlike reportThreatObservation)", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedSignature(repo);
  const result = await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001" }, SALT);
  assert.deepEqual(result, { accepted: true });
  assert.equal(repo.signatureDetections[0]?.organizationHash, null);
});

test("reportSignatureDetection tracks discoveredFromOrgCount as distinct orgs, not raw report count -- same distinct-counting fix as observations.ts", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await seedSignature(repo);

  // Same org reports 3 times.
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-1" }, SALT);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-1" }, SALT);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-1" }, SALT);

  const updated = await repo.getSignatureById(sig.id);
  assert.equal(updated?.totalDetections, 3);
  assert.equal(updated?.discoveredFromOrgCount, 1, "one distinct org, not 3");
});

test("reportSignatureDetection counts multiple distinct orgs correctly", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await seedSignature(repo);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-1" }, SALT);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-2" }, SALT);

  const updated = await repo.getSignatureById(sig.id);
  assert.equal(updated?.discoveredFromOrgCount, 2);
});

test("reportSignatureDetection never stores the raw organizationId, only its hash", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedSignature(repo);
  await reportSignatureDetection(repo, { signatureId: "PROMPT-2026-001", organizationId: "org-1" }, SALT);

  const stored = repo.signatureDetections[0];
  assert.notEqual(stored?.organizationHash, "org-1");
  assert.match(stored?.organizationHash ?? "", /^[0-9a-f]{64}$/);
});
