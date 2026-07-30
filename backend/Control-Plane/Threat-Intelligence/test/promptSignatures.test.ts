import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPromptAbuseSignature,
  setSignatureActive,
  graduateSignature,
  SignatureError,
} from "../src/promptSignatures.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

function baseInput(overrides: Partial<Parameters<typeof createPromptAbuseSignature>[1]> = {}) {
  return {
    signatureId: "PROMPT-2026-001",
    signatureName: "System Prompt Extraction",
    category: "extraction",
    detectionLogic: { keywords: ["show me your system prompt"] },
    severity: "medium" as const,
    riskScore: 0.6,
    ...overrides,
  };
}

test("createPromptAbuseSignature defaults matchThreshold and starts active, non-experimental unless specified", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await createPromptAbuseSignature(repo, baseInput());
  assert.equal(sig.matchThreshold, 0.85);
  assert.equal(sig.isActive, true);
  assert.equal(sig.isExperimental, false);
  assert.equal(sig.totalDetections, 0);
});

test("createPromptAbuseSignature honors isExperimental: true", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await createPromptAbuseSignature(repo, baseInput({ isExperimental: true }));
  assert.equal(sig.isExperimental, true);
});

test("createPromptAbuseSignature rejects a duplicate signatureId", async () => {
  const repo = new FakeThreatIntelRepository();
  await createPromptAbuseSignature(repo, baseInput());
  await assert.rejects(
    () => createPromptAbuseSignature(repo, baseInput()),
    (err: unknown) => err instanceof SignatureError && err.code === "duplicate_signature_id",
  );
});

test("createPromptAbuseSignature rejects riskScore outside [0,1]", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => createPromptAbuseSignature(repo, baseInput({ riskScore: 2 })),
    (err: unknown) => err instanceof SignatureError && err.code === "invalid_input",
  );
});

test("setSignatureActive can deactivate and reactivate", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await createPromptAbuseSignature(repo, baseInput());
  const deactivated = await setSignatureActive(repo, sig.id, false);
  assert.equal(deactivated.isActive, false);
  const reactivated = await setSignatureActive(repo, sig.id, true);
  assert.equal(reactivated.isActive, true);
});

test("graduateSignature clears isExperimental", async () => {
  const repo = new FakeThreatIntelRepository();
  const sig = await createPromptAbuseSignature(repo, baseInput({ isExperimental: true }));
  const graduated = await graduateSignature(repo, sig.id);
  assert.equal(graduated.isExperimental, false);
});

test("setSignatureActive throws for an unknown signature", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setSignatureActive(repo, "ghost-sig", false),
    (err: unknown) => err instanceof SignatureError && err.code === "signature_not_found",
  );
});
