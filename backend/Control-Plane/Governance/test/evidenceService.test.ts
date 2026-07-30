import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditEvidenceError, attachEvidence, listEvidenceForTarget, listRecentEvidence, removeEvidence } from "../src/evidenceService.js";
import { createPolicy } from "../src/policyService.js";
import { FakeGovernanceRepository } from "../test/fakeRepository.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { createControl } from "../../Compliance/src/controlService.js";

test("attachEvidence throws target_not_found for an unknown control", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  await assert.rejects(
    () =>
      attachEvidence(governanceRepo, complianceRepo, {
        targetType: "control",
        targetId: "ghost-control",
        evidenceType: "attestation",
        description: "x",
        attachedByStaffId: "staff-1",
      }),
    (err: unknown) => err instanceof AuditEvidenceError && err.code === "target_not_found",
  );
});

test("attachEvidence throws target_not_found for an unknown policy", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  await assert.rejects(
    () =>
      attachEvidence(governanceRepo, complianceRepo, {
        targetType: "policy",
        targetId: "ghost-policy",
        evidenceType: "attestation",
        description: "x",
        attachedByStaffId: "staff-1",
      }),
    (err: unknown) => err instanceof AuditEvidenceError && err.code === "target_not_found",
  );
});

test("attachEvidence does NOT validate an unrecognized target type -- stays genuinely open for a future target, not just open in name", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const evidence = await attachEvidence(governanceRepo, complianceRepo, {
    targetType: "future_thing_this_module_has_never_heard_of",
    targetId: "whatever-id",
    evidenceType: "other",
    description: "x",
    attachedByStaffId: "staff-1",
  });
  assert.equal(evidence.targetType, "future_thing_this_module_has_never_heard_of");
});

test("the worked example: evidence attached to a real control is retrievable by target", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  const evidence = await attachEvidence(governanceRepo, complianceRepo, {
    targetType: "control",
    targetId: control.id,
    evidenceType: "attestation",
    description: "Q3 2026 disclosure banner audit -- signed off by compliance.",
    referenceUrl: "https://internal.example.com/audits/q3-2026-disclosure",
    attachedByStaffId: "staff-1",
  });

  assert.equal(evidence.evidenceType, "attestation");
  assert.equal(evidence.referenceUrl, "https://internal.example.com/audits/q3-2026-disclosure");

  const forTarget = await listEvidenceForTarget(governanceRepo, "control", control.id);
  assert.equal(forTarget.length, 1);
  assert.equal(forTarget[0]!.id, evidence.id);
});

test("evidence for a policy is scoped correctly, distinct from evidence for a control with the same underlying id shape", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const policy = await createPolicy(governanceRepo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });

  await attachEvidence(governanceRepo, complianceRepo, {
    targetType: "policy",
    targetId: policy.id,
    evidenceType: "log_reference",
    description: "Deployment log showing banner rollout.",
    attachedByStaffId: "staff-1",
  });

  const forPolicy = await listEvidenceForTarget(governanceRepo, "policy", policy.id);
  assert.equal(forPolicy.length, 1);

  const forControlWithSameId = await listEvidenceForTarget(governanceRepo, "control", policy.id);
  assert.equal(forControlWithSameId.length, 0);
});

test("listEvidenceForTarget returns evidence oldest first", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  await attachEvidence(
    governanceRepo,
    complianceRepo,
    { targetType: "control", targetId: control.id, evidenceType: "document", description: "First", attachedByStaffId: "staff-1" },
    new Date("2026-01-01T00:00:00Z"),
  );
  await attachEvidence(
    governanceRepo,
    complianceRepo,
    { targetType: "control", targetId: control.id, evidenceType: "document", description: "Second", attachedByStaffId: "staff-1" },
    new Date("2026-02-01T00:00:00Z"),
  );

  const all = await listEvidenceForTarget(governanceRepo, "control", control.id);
  assert.deepEqual(all.map((e) => e.description), ["First", "Second"]);
});

test("removeEvidence deletes the record", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const evidence = await attachEvidence(governanceRepo, complianceRepo, {
    targetType: "control",
    targetId: control.id,
    evidenceType: "other",
    description: "x",
    attachedByStaffId: "staff-1",
  });

  await removeEvidence(governanceRepo, evidence.id);

  const forTarget = await listEvidenceForTarget(governanceRepo, "control", control.id);
  assert.equal(forTarget.length, 0);
});

test("removeEvidence throws evidence_not_found for an unknown id", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  await assert.rejects(
    () => removeEvidence(governanceRepo, "ghost-evidence"),
    (err: unknown) => err instanceof AuditEvidenceError && err.code === "evidence_not_found",
  );
});

test("listRecentEvidence is unscoped -- returns evidence across every target, most recent first", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const controlA = await createControl(complianceRepo, { key: "ctrl-a", code: "CTRL-001", name: "A", description: "x" });
  const controlB = await createControl(complianceRepo, { key: "ctrl-b", code: "CTRL-002", name: "B", description: "x" });
  const policy = await createPolicy(governanceRepo, { key: "policy-a", name: "Policy A", description: "x" });

  await attachEvidence(
    governanceRepo,
    complianceRepo,
    { targetType: "control", targetId: controlA.id, evidenceType: "document", description: "Earliest", attachedByStaffId: "staff-1" },
    new Date("2026-01-01T00:00:00Z"),
  );
  await attachEvidence(
    governanceRepo,
    complianceRepo,
    { targetType: "policy", targetId: policy.id, evidenceType: "attestation", description: "Middle", attachedByStaffId: "staff-1" },
    new Date("2026-02-01T00:00:00Z"),
  );
  await attachEvidence(
    governanceRepo,
    complianceRepo,
    { targetType: "control", targetId: controlB.id, evidenceType: "log_reference", description: "Latest", attachedByStaffId: "staff-1" },
    new Date("2026-03-01T00:00:00Z"),
  );

  const recent = await listRecentEvidence(governanceRepo);
  assert.equal(recent.length, 3);
  assert.deepEqual(recent.map((e) => e.description), ["Latest", "Middle", "Earliest"]);
});
