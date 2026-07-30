/**
 * Policy violations: deliberately staff-reported, not auto-detected --
 * see types.ts's own doc comment for why. This file is the workflow
 * around that report: open -> resolved or dismissed, both terminal
 * (unlike Policy's own status, there's a real reason to keep this
 * restrictive -- a resolved/dismissed violation is a closed
 * investigation with a stated outcome; reopening it should mean filing
 * a new violation with its own fresh record, not silently mutating a
 * closed one back to open and losing the resolution's own context).
 */
import { randomUUID } from "node:crypto";
import type { GovernanceRepository } from "./repository.js";
import type { PolicyViolation, PolicyViolationSeverity, PolicyViolationStatus } from "./types.js";
import { PolicyError } from "./policyService.js";

export class PolicyViolationError extends Error {
  constructor(
    message: string,
    public readonly code: "violation_not_found" | "policy_not_found" | "already_closed",
  ) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

export interface ReportViolationInput {
  policyId: string;
  organizationId?: string | null;
  description: string;
  severity: PolicyViolationSeverity;
  reportedByStaffId: string;
}

export async function reportViolation(repo: GovernanceRepository, input: ReportViolationInput, now: Date = new Date()): Promise<PolicyViolation> {
  const policy = await repo.getPolicyById(input.policyId);
  if (!policy) {
    throw new PolicyError(`Unknown policy: ${input.policyId}`, "policy_not_found");
  }

  const violation: PolicyViolation = {
    id: randomUUID(),
    policyId: input.policyId,
    organizationId: input.organizationId ?? null,
    description: input.description,
    severity: input.severity,
    status: "open",
    reportedByStaffId: input.reportedByStaffId,
    reportedAt: now,
    resolvedAt: null,
    resolutionNotes: null,
  };
  await repo.createViolation(violation);
  return violation;
}

async function requireOpenViolation(repo: GovernanceRepository, violationId: string): Promise<PolicyViolation> {
  const violation = await repo.getViolationById(violationId);
  if (!violation) {
    throw new PolicyViolationError(`Unknown violation: ${violationId}`, "violation_not_found");
  }
  if (violation.status !== "open") {
    throw new PolicyViolationError(`Violation is already "${violation.status}" -- only an open violation can be closed`, "already_closed");
  }
  return violation;
}

export async function resolveViolation(
  repo: GovernanceRepository,
  violationId: string,
  resolutionNotes: string,
  now: Date = new Date(),
): Promise<PolicyViolation> {
  const violation = await requireOpenViolation(repo, violationId);
  const updated: PolicyViolation = { ...violation, status: "resolved", resolvedAt: now, resolutionNotes };
  await repo.updateViolation(updated);
  return updated;
}

export async function dismissViolation(
  repo: GovernanceRepository,
  violationId: string,
  resolutionNotes: string,
  now: Date = new Date(),
): Promise<PolicyViolation> {
  const violation = await requireOpenViolation(repo, violationId);
  const updated: PolicyViolation = { ...violation, status: "dismissed", resolvedAt: now, resolutionNotes };
  await repo.updateViolation(updated);
  return updated;
}

export async function listViolationsForPolicy(repo: GovernanceRepository, policyId: string, opts?: { limit?: number }): Promise<PolicyViolation[]> {
  return repo.listViolationsForPolicy(policyId, opts);
}

export async function listViolations(
  repo: GovernanceRepository,
  opts?: { status?: PolicyViolationStatus; organizationId?: string; limit?: number },
): Promise<PolicyViolation[]> {
  return repo.listViolations(opts);
}
