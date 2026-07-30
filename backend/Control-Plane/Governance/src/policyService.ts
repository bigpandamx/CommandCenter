/**
 * Policy management. Structurally mirrors frameworkService.ts on
 * purpose -- see types.ts's own doc comment for why. Takes both a
 * GovernanceRepository and a ComplianceRepository throughout: this
 * module doesn't own ComplianceControl, so every function that touches
 * a control needs to resolve it via Compliance's own repository, the
 * same cross-module pattern ImpactAssessment's packMatching.ts and
 * controlLibraryStats.ts already established.
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { ComplianceControl } from "../../Compliance/src/types.js";
import type { GovernanceRepository } from "./repository.js";
import type { Policy, PolicyStatus } from "./types.js";

export class PolicyError extends Error {
  constructor(
    message: string,
    public readonly code: "policy_not_found" | "duplicate_key" | "invalid_key" | "control_not_found" | "invalid_transition",
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createPolicy(
  repo: GovernanceRepository,
  input: { key: string; name: string; description: string },
  now: Date = new Date(),
): Promise<Policy> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new PolicyError(`Invalid policy key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai-transparency-policy")`, "invalid_key");
  }
  const existing = await repo.getPolicyByKey(input.key);
  if (existing) {
    throw new PolicyError(`A policy with key "${input.key}" already exists`, "duplicate_key");
  }

  const policy: Policy = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await repo.createPolicy(policy);
  return policy;
}

export async function listPolicies(repo: GovernanceRepository, opts?: { limit?: number; status?: PolicyStatus }): Promise<Policy[]> {
  return repo.listPolicies(opts);
}

async function requirePolicyByKey(repo: GovernanceRepository, key: string): Promise<Policy> {
  const policy = await repo.getPolicyByKey(key);
  if (!policy) {
    throw new PolicyError(`No policy with key "${key}"`, "policy_not_found");
  }
  return policy;
}

/**
 * Fully-connected 3-state transition, same reasoning as Obligation
 * Review's own status graph -- nothing downstream depends on the label
 * yet, so there's no real consequence a restrictive transition table
 * would guard against. A policy can move from draft straight to
 * retired (e.g. authored, then decided against before ever going
 * active) just as freely as the more common draft -> active -> retired
 * path.
 */
export async function setPolicyStatus(repo: GovernanceRepository, key: string, status: PolicyStatus, now: Date = new Date()): Promise<Policy> {
  const policy = await requirePolicyByKey(repo, key);
  const updated: Policy = { ...policy, status, updatedAt: now };
  await repo.updatePolicy(updated);
  return updated;
}

async function requireControlByKey(complianceRepo: ComplianceRepository, key: string): Promise<ComplianceControl> {
  const control = await complianceRepo.getControlByKey(key);
  if (!control) {
    throw new PolicyError(`No control with key "${key}"`, "control_not_found");
  }
  return control;
}

export async function addControlToPolicy(
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  policyKey: string,
  controlKey: string,
): Promise<void> {
  const policy = await requirePolicyByKey(governanceRepo, policyKey);
  const control = await requireControlByKey(complianceRepo, controlKey);
  await governanceRepo.addControlToPolicy(policy.id, control.id);
}

export async function removeControlFromPolicy(
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  policyKey: string,
  controlKey: string,
): Promise<void> {
  const policy = await requirePolicyByKey(governanceRepo, policyKey);
  const control = await requireControlByKey(complianceRepo, controlKey);
  await governanceRepo.removeControlFromPolicy(policy.id, control.id);
}

/** Resolved to full ComplianceControl objects -- what a policy's own detail view needs to render. */
export async function listControlsForPolicy(
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  policyKey: string,
): Promise<ComplianceControl[]> {
  const policy = await requirePolicyByKey(governanceRepo, policyKey);
  const controlIds = await governanceRepo.listControlIdsForPolicy(policy.id);
  const controls: ComplianceControl[] = [];
  for (const id of controlIds) {
    const control = await complianceRepo.getControlById(id);
    if (control) controls.push(control);
  }
  return controls;
}

/** The reverse view -- "which policies enforce CTRL-001." */
export async function listPoliciesForControl(
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  controlKey: string,
): Promise<Policy[]> {
  const control = await requireControlByKey(complianceRepo, controlKey);
  const policyIds = await governanceRepo.listPolicyIdsForControl(control.id);
  const policies: Policy[] = [];
  for (const id of policyIds) {
    const policy = await governanceRepo.getPolicyById(id);
    if (policy) policies.push(policy);
  }
  return policies;
}
