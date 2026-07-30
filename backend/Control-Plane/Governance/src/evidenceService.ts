/**
 * Audit Evidence: deliberately staff-attached, not auto-collected --
 * see types.ts's own doc comment on AuditEvidence and
 * 0049_audit_evidence.sql for the full reasoning.
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { GovernanceRepository } from "./repository.js";
import type { AuditEvidence, AuditEvidenceType } from "./types.js";

export class AuditEvidenceError extends Error {
  constructor(
    message: string,
    public readonly code: "evidence_not_found" | "target_not_found",
  ) {
    super(message);
    this.name = "AuditEvidenceError";
  }
}

export interface AttachEvidenceInput {
  targetType: string;
  targetId: string;
  evidenceType: AuditEvidenceType;
  description: string;
  referenceUrl?: string | null;
  attachedByStaffId: string;
}

/**
 * Validates the target exists for the two target types this round
 * actually wires up (control, policy) -- an unrecognized targetType
 * is trusted as-is rather than rejected, keeping the open-string
 * design genuinely open for a future target this module doesn't know
 * about yet, not just open in name.
 */
export async function attachEvidence(
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  input: AttachEvidenceInput,
  now: Date = new Date(),
): Promise<AuditEvidence> {
  if (input.targetType === "control") {
    const control = await complianceRepo.getControlById(input.targetId);
    if (!control) {
      throw new AuditEvidenceError(`Unknown control: ${input.targetId}`, "target_not_found");
    }
  } else if (input.targetType === "policy") {
    const policy = await governanceRepo.getPolicyById(input.targetId);
    if (!policy) {
      throw new AuditEvidenceError(`Unknown policy: ${input.targetId}`, "target_not_found");
    }
  }

  const evidence: AuditEvidence = {
    id: randomUUID(),
    targetType: input.targetType,
    targetId: input.targetId,
    evidenceType: input.evidenceType,
    description: input.description,
    referenceUrl: input.referenceUrl ?? null,
    attachedByStaffId: input.attachedByStaffId,
    attachedAt: now,
  };
  await governanceRepo.createAuditEvidence(evidence);
  return evidence;
}

export async function listEvidenceForTarget(
  repo: GovernanceRepository,
  targetType: string,
  targetId: string,
  opts?: { limit?: number },
): Promise<AuditEvidence[]> {
  return repo.listAuditEvidenceForTarget(targetType, targetId, opts);
}

/** Unscoped, most recent first -- what the aggregate Governance dashboard shows. */
export async function listRecentEvidence(repo: GovernanceRepository, opts?: { limit?: number }): Promise<AuditEvidence[]> {
  return repo.listAllAuditEvidence(opts);
}

/** A simple hard delete -- unlike Policy/Violation/Approval, evidence has no meaningful state transitions worth preserving as history; it's a record staff can correct if entered by mistake (wrong link, duplicate entry). */
export async function removeEvidence(repo: GovernanceRepository, id: string): Promise<void> {
  const existing = await repo.getAuditEvidenceById(id);
  if (!existing) {
    throw new AuditEvidenceError(`Unknown evidence: ${id}`, "evidence_not_found");
  }
  await repo.deleteAuditEvidence(id);
}
