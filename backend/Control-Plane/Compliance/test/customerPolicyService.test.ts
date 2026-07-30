import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CustomerPolicyError,
  submitCustomerPolicy,
  listCustomerPoliciesForOrganization,
  markCustomerPolicyReviewed,
  rejectCustomerPolicy,
  addControlToCustomerPolicy,
  removeControlFromCustomerPolicy,
  listControlsForCustomerPolicy,
  listCustomerPoliciesForControl,
} from "../src/customerPolicyService.js";
import { createControl } from "../src/controlService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";

const ORG_ID = "org-1";

test("submitCustomerPolicy always starts pending_review, with no reviewer set", async () => {
  const repo = new FakeComplianceRepository();
  const policy = await submitCustomerPolicy(repo, {
    organizationId: ORG_ID,
    name: "Acme Corp AI Usage Policy",
    description: "Internal policy governing use of AI tools.",
    submittedByStaffId: "staff-1",
  });

  assert.equal(policy.status, "pending_review");
  assert.equal(policy.reviewedByStaffId, null);
  assert.equal(policy.reviewedAt, null);
  assert.equal(policy.reviewNotes, null);
});

test("submitCustomerPolicy accepts an optional documentUrl, defaulting to null when omitted", async () => {
  const repo = new FakeComplianceRepository();
  const withUrl = await submitCustomerPolicy(repo, {
    organizationId: ORG_ID,
    name: "Acme Corp AI Usage Policy",
    description: "x",
    documentUrl: "https://acme.example.com/policies/ai-usage.pdf",
    submittedByStaffId: "staff-1",
  });
  const withoutUrl = await submitCustomerPolicy(repo, {
    organizationId: ORG_ID,
    name: "Acme Corp Data Retention Policy",
    description: "x",
    submittedByStaffId: "staff-1",
  });

  assert.equal(withUrl.documentUrl, "https://acme.example.com/policies/ai-usage.pdf");
  assert.equal(withoutUrl.documentUrl, null);
});

test("listCustomerPoliciesForOrganization only returns policies for that specific org", async () => {
  const repo = new FakeComplianceRepository();
  await submitCustomerPolicy(repo, { organizationId: "org-1", name: "Org 1 Policy", description: "x", submittedByStaffId: "staff-1" });
  await submitCustomerPolicy(repo, { organizationId: "org-2", name: "Org 2 Policy", description: "x", submittedByStaffId: "staff-1" });

  const forOrg1 = await listCustomerPoliciesForOrganization(repo, "org-1");
  assert.equal(forOrg1.length, 1);
  assert.equal(forOrg1[0]!.name, "Org 1 Policy");
});

test("listCustomerPoliciesForOrganization filters by status", async () => {
  const repo = new FakeComplianceRepository();
  const a = await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "A", description: "x", submittedByStaffId: "staff-1" });
  await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "B", description: "x", submittedByStaffId: "staff-1" });
  await markCustomerPolicyReviewed(repo, a.id, "staff-2");

  const pendingOnly = await listCustomerPoliciesForOrganization(repo, ORG_ID, { status: "pending_review" });
  assert.equal(pendingOnly.length, 1);
  assert.equal(pendingOnly[0]!.name, "B");
});

test("markCustomerPolicyReviewed and rejectCustomerPolicy record the reviewing staff member and notes", async () => {
  const repo = new FakeComplianceRepository();
  const a = await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "A", description: "x", submittedByStaffId: "staff-1" });
  const b = await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "B", description: "x", submittedByStaffId: "staff-1" });

  const reviewed = await markCustomerPolicyReviewed(repo, a.id, "staff-2", "Covers transparency and audit logging.");
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.reviewedByStaffId, "staff-2");
  assert.equal(reviewed.reviewNotes, "Covers transparency and audit logging.");

  const rejected = await rejectCustomerPolicy(repo, b.id, "staff-2", "Document is actually a marketing page, not a policy.");
  assert.equal(rejected.status, "rejected");
});

test("reviewing an already-decided policy throws already_decided -- both outcomes are terminal", async () => {
  const repo = new FakeComplianceRepository();
  const policy = await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "A", description: "x", submittedByStaffId: "staff-1" });
  await markCustomerPolicyReviewed(repo, policy.id, "staff-2");

  await assert.rejects(
    () => markCustomerPolicyReviewed(repo, policy.id, "staff-2"),
    (err: unknown) => err instanceof CustomerPolicyError && err.code === "already_decided",
  );
  await assert.rejects(
    () => rejectCustomerPolicy(repo, policy.id, "staff-2"),
    (err: unknown) => err instanceof CustomerPolicyError && err.code === "already_decided",
  );
});

test("markCustomerPolicyReviewed throws policy_not_found for an unknown id", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => markCustomerPolicyReviewed(repo, "ghost-policy", "staff-1"),
    (err: unknown) => err instanceof CustomerPolicyError && err.code === "policy_not_found",
  );
});

test("addControlToCustomerPolicy throws control_not_found for an unknown control key", async () => {
  const repo = new FakeComplianceRepository();
  const policy = await submitCustomerPolicy(repo, { organizationId: ORG_ID, name: "A", description: "x", submittedByStaffId: "staff-1" });

  await assert.rejects(
    () => addControlToCustomerPolicy(repo, policy.id, "ghost-control"),
    (err: unknown) => err instanceof CustomerPolicyError && err.code === "control_not_found",
  );
});

test("the worked example: a customer's AI Usage Policy is mapped to two controls, listed and removable", async () => {
  const repo = new FakeComplianceRepository();
  const policy = await submitCustomerPolicy(repo, {
    organizationId: ORG_ID,
    name: "Acme Corp AI Usage Policy",
    description: "x",
    submittedByStaffId: "staff-1",
  });
  const transparency = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const auditLogging = await createControl(repo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });

  await addControlToCustomerPolicy(repo, policy.id, transparency.key);
  await addControlToCustomerPolicy(repo, policy.id, auditLogging.key);

  const controls = await listControlsForCustomerPolicy(repo, policy.id);
  assert.equal(controls.length, 2);
  assert.deepEqual(new Set(controls.map((c) => c.key)), new Set(["ai-transparency", "ai-audit-logging"]));

  await removeControlFromCustomerPolicy(repo, policy.id, transparency.key);
  const afterRemoval = await listControlsForCustomerPolicy(repo, policy.id);
  assert.equal(afterRemoval.length, 1);
  assert.equal(afterRemoval[0]!.key, "ai-audit-logging");
});

test("listCustomerPoliciesForControl: the reverse view -- which of an org's policies cover a given control, across multiple orgs", async () => {
  const repo = new FakeComplianceRepository();
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const acmePolicy = await submitCustomerPolicy(repo, { organizationId: "org-acme", name: "Acme Policy", description: "x", submittedByStaffId: "staff-1" });
  const globexPolicy = await submitCustomerPolicy(repo, { organizationId: "org-globex", name: "Globex Policy", description: "x", submittedByStaffId: "staff-1" });

  await addControlToCustomerPolicy(repo, acmePolicy.id, control.key);
  await addControlToCustomerPolicy(repo, globexPolicy.id, control.key);

  const policies = await listCustomerPoliciesForControl(repo, control.key);
  assert.equal(policies.length, 2);
  assert.deepEqual(new Set(policies.map((p) => p.organizationId)), new Set(["org-acme", "org-globex"]));
});
