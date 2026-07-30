import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyViolationError, reportViolation, resolveViolation, dismissViolation, listViolationsForPolicy, listViolations } from "../src/violationService.js";
import { PolicyError, createPolicy } from "../src/policyService.js";
import { FakeGovernanceRepository } from "../test/fakeRepository.js";

async function seedPolicy(repo: FakeGovernanceRepository, key = "ai-transparency-policy") {
  return createPolicy(repo, { key, name: "AI Transparency Policy", description: "x" });
}

test("reportViolation throws policy_not_found for an unknown policy", async () => {
  const repo = new FakeGovernanceRepository();
  await assert.rejects(
    () => reportViolation(repo, { policyId: "ghost-policy", description: "x", severity: "medium", reportedByStaffId: "staff-1" }),
    (err: unknown) => err instanceof PolicyError && err.code === "policy_not_found",
  );
});

test("the worked example: a violation is reported open, with no organizationId when omitted", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);

  const violation = await reportViolation(repo, {
    policyId: policy.id,
    description: "AI Chat deployed without a disclosure banner",
    severity: "high",
    reportedByStaffId: "staff-1",
  });

  assert.equal(violation.status, "open");
  assert.equal(violation.organizationId, null);
  assert.equal(violation.resolvedAt, null);
  assert.equal(violation.resolutionNotes, null);
});

test("reportViolation accepts an organizationId for an org-scoped violation", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);

  const violation = await reportViolation(repo, {
    policyId: policy.id,
    organizationId: "org-1",
    description: "x",
    severity: "medium",
    reportedByStaffId: "staff-1",
  });

  assert.equal(violation.organizationId, "org-1");
});

test("resolveViolation closes an open violation with notes", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);
  const violation = await reportViolation(repo, { policyId: policy.id, description: "x", severity: "low", reportedByStaffId: "staff-1" });

  const resolved = await resolveViolation(repo, violation.id, "Disclosure banner added.");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolutionNotes, "Disclosure banner added.");
  assert.notEqual(resolved.resolvedAt, null);
});

test("dismissViolation closes an open violation as not-actually-a-violation", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);
  const violation = await reportViolation(repo, { policyId: policy.id, description: "x", severity: "low", reportedByStaffId: "staff-1" });

  const dismissed = await dismissViolation(repo, violation.id, "False alarm -- banner was present, just below the fold.");
  assert.equal(dismissed.status, "dismissed");
});

test("resolving or dismissing an already-closed violation throws already_closed -- both statuses are terminal", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);
  const violation = await reportViolation(repo, { policyId: policy.id, description: "x", severity: "low", reportedByStaffId: "staff-1" });
  await resolveViolation(repo, violation.id, "Fixed.");

  await assert.rejects(
    () => resolveViolation(repo, violation.id, "Again?"),
    (err: unknown) => err instanceof PolicyViolationError && err.code === "already_closed",
  );
  await assert.rejects(
    () => dismissViolation(repo, violation.id, "Never mind."),
    (err: unknown) => err instanceof PolicyViolationError && err.code === "already_closed",
  );
});

test("resolveViolation throws violation_not_found for an unknown id", async () => {
  const repo = new FakeGovernanceRepository();
  await assert.rejects(
    () => resolveViolation(repo, "ghost-violation", "x"),
    (err: unknown) => err instanceof PolicyViolationError && err.code === "violation_not_found",
  );
});

test("listViolationsForPolicy returns only violations for that specific policy", async () => {
  const repo = new FakeGovernanceRepository();
  const policyA = await seedPolicy(repo, "policy-a");
  const policyB = await seedPolicy(repo, "policy-b");
  await reportViolation(repo, { policyId: policyA.id, description: "A1", severity: "low", reportedByStaffId: "staff-1" });
  await reportViolation(repo, { policyId: policyB.id, description: "B1", severity: "low", reportedByStaffId: "staff-1" });

  const forA = await listViolationsForPolicy(repo, policyA.id);
  assert.equal(forA.length, 1);
  assert.equal(forA[0]!.description, "A1");
});

test("listViolations filters by status and organizationId", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await seedPolicy(repo);
  const v1 = await reportViolation(repo, { policyId: policy.id, organizationId: "org-1", description: "V1", severity: "low", reportedByStaffId: "staff-1" });
  await reportViolation(repo, { policyId: policy.id, organizationId: "org-2", description: "V2", severity: "low", reportedByStaffId: "staff-1" });
  await resolveViolation(repo, v1.id, "Fixed.");

  const openOnly = await listViolations(repo, { status: "open" });
  assert.equal(openOnly.length, 1);
  assert.equal(openOnly[0]!.description, "V2");

  const forOrg1 = await listViolations(repo, { organizationId: "org-1" });
  assert.equal(forOrg1.length, 1);
  assert.equal(forOrg1[0]!.description, "V1");
});
