import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyError, createPolicy, listPolicies, setPolicyStatus, addControlToPolicy, removeControlFromPolicy, listControlsForPolicy, listPoliciesForControl } from "../src/policyService.js";
import { createControl } from "../../Compliance/src/controlService.js";
import { FakeGovernanceRepository } from "../test/fakeRepository.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";

test("createPolicy rejects an invalid key format", async () => {
  const repo = new FakeGovernanceRepository();
  await assert.rejects(
    () => createPolicy(repo, { key: "AI Transparency!", name: "x", description: "x" }),
    (err: unknown) => err instanceof PolicyError && err.code === "invalid_key",
  );
});

test("createPolicy rejects a duplicate key", async () => {
  const repo = new FakeGovernanceRepository();
  await createPolicy(repo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });
  await assert.rejects(
    () => createPolicy(repo, { key: "ai-transparency-policy", name: "Again", description: "x" }),
    (err: unknown) => err instanceof PolicyError && err.code === "duplicate_key",
  );
});

test("createPolicy always starts as draft", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await createPolicy(repo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });
  assert.equal(policy.status, "draft");
});

test("setPolicyStatus supports the full draft -> active -> retired path", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await createPolicy(repo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });

  const active = await setPolicyStatus(repo, policy.key, "active");
  assert.equal(active.status, "active");

  const retired = await setPolicyStatus(repo, policy.key, "retired");
  assert.equal(retired.status, "retired");
});

test("setPolicyStatus also allows draft straight to retired, a fully-connected graph on purpose", async () => {
  const repo = new FakeGovernanceRepository();
  const policy = await createPolicy(repo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });

  const retired = await setPolicyStatus(repo, policy.key, "retired");
  assert.equal(retired.status, "retired");
});

test("setPolicyStatus throws policy_not_found for an unknown key", async () => {
  const repo = new FakeGovernanceRepository();
  await assert.rejects(
    () => setPolicyStatus(repo, "ghost-policy", "active"),
    (err: unknown) => err instanceof PolicyError && err.code === "policy_not_found",
  );
});

test("addControlToPolicy throws policy_not_found / control_not_found appropriately", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const policy = await createPolicy(governanceRepo, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  await assert.rejects(
    () => addControlToPolicy(governanceRepo, complianceRepo, "ghost-policy", control.key),
    (err: unknown) => err instanceof PolicyError && err.code === "policy_not_found",
  );
  await assert.rejects(
    () => addControlToPolicy(governanceRepo, complianceRepo, policy.key, "ghost-control"),
    (err: unknown) => err instanceof PolicyError && err.code === "control_not_found",
  );
});

test("the worked example: a policy implements two controls, listed and removable", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const policy = await createPolicy(governanceRepo, { key: "ai-chat-disclosure-policy", name: "AI Chat Disclosure Policy", description: "x" });
  const transparency = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const auditLogging = await createControl(complianceRepo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });

  await addControlToPolicy(governanceRepo, complianceRepo, policy.key, transparency.key);
  await addControlToPolicy(governanceRepo, complianceRepo, policy.key, auditLogging.key);

  const controls = await listControlsForPolicy(governanceRepo, complianceRepo, policy.key);
  assert.equal(controls.length, 2);
  assert.deepEqual(new Set(controls.map((c) => c.key)), new Set(["ai-transparency", "ai-audit-logging"]));

  await removeControlFromPolicy(governanceRepo, complianceRepo, policy.key, transparency.key);
  const afterRemoval = await listControlsForPolicy(governanceRepo, complianceRepo, policy.key);
  assert.equal(afterRemoval.length, 1);
  assert.equal(afterRemoval[0]!.key, "ai-audit-logging");
});

test("listPoliciesForControl: the reverse view -- which policies enforce a given control", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const complianceRepo = new FakeComplianceRepository();
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const policyA = await createPolicy(governanceRepo, { key: "policy-a", name: "Policy A", description: "x" });
  const policyB = await createPolicy(governanceRepo, { key: "policy-b", name: "Policy B", description: "x" });

  await addControlToPolicy(governanceRepo, complianceRepo, policyA.key, control.key);
  await addControlToPolicy(governanceRepo, complianceRepo, policyB.key, control.key);

  const policies = await listPoliciesForControl(governanceRepo, complianceRepo, control.key);
  assert.equal(policies.length, 2);
  assert.deepEqual(new Set(policies.map((p) => p.key)), new Set(["policy-a", "policy-b"]));
});

test("listPolicies filters by status", async () => {
  const repo = new FakeGovernanceRepository();
  const a = await createPolicy(repo, { key: "policy-a", name: "Policy A", description: "x" });
  await createPolicy(repo, { key: "policy-b", name: "Policy B", description: "x" });
  await setPolicyStatus(repo, a.key, "active");

  const activeOnly = await listPolicies(repo, { status: "active" });
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0]!.key, "policy-a");
});
