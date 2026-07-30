/**
 * Customer Policy mapping: an org's own internal policy document,
 * mapped onto the controls it covers. See types.ts's own doc comment
 * on CustomerPolicy and 0050_customer_policies.sql for the full
 * reasoning, including why this is distinct from both Governance's own
 * Policy and AuditEvidence.
 *
 * Structurally mirrors frameworkService.ts/packService.ts on purpose
 * -- a named entity with a many-to-many relationship to
 * ComplianceControl -- but every listing is scoped by organizationId,
 * and there's a review workflow frameworkService.ts has no equivalent
 * of: a customer policy isn't just registered, it's submitted, then a
 * staff member reviews it and records whether it actually covers what
 * it claims to.
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceControl, CustomerPolicy, CustomerPolicyStatus } from "./types.js";

export class CustomerPolicyError extends Error {
  constructor(
    message: string,
    public readonly code: "policy_not_found" | "control_not_found" | "already_decided",
  ) {
    super(message);
    this.name = "CustomerPolicyError";
  }
}

export interface SubmitCustomerPolicyInput {
  organizationId: string;
  name: string;
  description: string;
  documentUrl?: string | null;
  submittedByStaffId: string;
}

export async function submitCustomerPolicy(
  repo: ComplianceRepository,
  input: SubmitCustomerPolicyInput,
  now: Date = new Date(),
): Promise<CustomerPolicy> {
  const policy: CustomerPolicy = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: input.name,
    description: input.description,
    documentUrl: input.documentUrl ?? null,
    status: "pending_review",
    submittedByStaffId: input.submittedByStaffId,
    submittedAt: now,
    reviewedByStaffId: null,
    reviewedAt: null,
    reviewNotes: null,
  };
  await repo.createCustomerPolicy(policy);
  return policy;
}

export async function listCustomerPoliciesForOrganization(
  repo: ComplianceRepository,
  organizationId: string,
  opts?: { status?: CustomerPolicyStatus },
): Promise<CustomerPolicy[]> {
  return repo.listCustomerPoliciesForOrganization(organizationId, opts);
}

async function requireCustomerPolicyById(repo: ComplianceRepository, id: string): Promise<CustomerPolicy> {
  const policy = await repo.getCustomerPolicyById(id);
  if (!policy) {
    throw new CustomerPolicyError(`No customer policy with id "${id}"`, "policy_not_found");
  }
  return policy;
}

async function requirePendingCustomerPolicy(repo: ComplianceRepository, id: string): Promise<CustomerPolicy> {
  const policy = await requireCustomerPolicyById(repo, id);
  if (policy.status !== "pending_review") {
    throw new CustomerPolicyError(`Policy is already "${policy.status}" -- only a pending_review policy can be reviewed`, "already_decided");
  }
  return policy;
}

/**
 * Terminal once decided, same reasoning as PolicyViolation's own
 * resolve/dismiss -- a reviewed or rejected policy is a closed
 * decision with a stated outcome. A revised version of the same
 * underlying document is a fresh submission, not a reopened one.
 */
export async function markCustomerPolicyReviewed(
  repo: ComplianceRepository,
  id: string,
  staffId: string,
  reviewNotes: string | null = null,
  now: Date = new Date(),
): Promise<CustomerPolicy> {
  const policy = await requirePendingCustomerPolicy(repo, id);
  const updated: CustomerPolicy = { ...policy, status: "reviewed", reviewedByStaffId: staffId, reviewedAt: now, reviewNotes };
  await repo.updateCustomerPolicy(updated);
  return updated;
}

export async function rejectCustomerPolicy(
  repo: ComplianceRepository,
  id: string,
  staffId: string,
  reviewNotes: string | null = null,
  now: Date = new Date(),
): Promise<CustomerPolicy> {
  const policy = await requirePendingCustomerPolicy(repo, id);
  const updated: CustomerPolicy = { ...policy, status: "rejected", reviewedByStaffId: staffId, reviewedAt: now, reviewNotes };
  await repo.updateCustomerPolicy(updated);
  return updated;
}

async function requireControlByKey(repo: ComplianceRepository, key: string): Promise<ComplianceControl> {
  const control = await repo.getControlByKey(key);
  if (!control) {
    throw new CustomerPolicyError(`No control with key "${key}"`, "control_not_found");
  }
  return control;
}

export async function addControlToCustomerPolicy(repo: ComplianceRepository, customerPolicyId: string, controlKey: string): Promise<void> {
  const policy = await requireCustomerPolicyById(repo, customerPolicyId);
  const control = await requireControlByKey(repo, controlKey);
  await repo.addControlToCustomerPolicy(policy.id, control.id);
}

export async function removeControlFromCustomerPolicy(repo: ComplianceRepository, customerPolicyId: string, controlKey: string): Promise<void> {
  const policy = await requireCustomerPolicyById(repo, customerPolicyId);
  const control = await requireControlByKey(repo, controlKey);
  await repo.removeControlFromCustomerPolicy(policy.id, control.id);
}

/** Resolved to full ComplianceControl objects -- what a customer policy's own detail view needs to render. */
export async function listControlsForCustomerPolicy(repo: ComplianceRepository, customerPolicyId: string): Promise<ComplianceControl[]> {
  await requireCustomerPolicyById(repo, customerPolicyId);
  return repo.listControlsForCustomerPolicy(customerPolicyId);
}

/** The reverse view -- "which of this org's policies cover CTRL-001," alongside listFrameworksForControl/listPacksForControl for the full "what maps to this control" picture. */
export async function listCustomerPoliciesForControl(repo: ComplianceRepository, controlKey: string): Promise<CustomerPolicy[]> {
  const control = await requireControlByKey(repo, controlKey);
  return repo.listCustomerPoliciesForControl(control.id);
}
