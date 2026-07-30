/**
 * Risk Treatments: see types.ts's own doc comment on RiskTreatment for
 * the full reasoning -- this is the pipeline stage most likely to
 * accidentally become Controls with a different label, so the
 * distinction is enforced here structurally, not just asserted.
 *
 * Deliberately no "treatment coverage" function anywhere in this file.
 * An insight with zero treatments is not computed, tracked, or
 * surfaced as a gap -- there is no equivalent of
 * computeFrameworkCoverage or computeRiskFactorSummary here on
 * purpose. Building one, even framed neutrally, would smuggle
 * Compliance's own "unmapped requirement is a finding" logic back in
 * under a different name.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { RiskTreatment, RiskTreatmentStatus, RiskTreatmentType } from "./types.js";

export class RiskTreatmentError extends Error {
  constructor(
    message: string,
    public readonly code: "insight_not_found" | "treatment_not_found",
  ) {
    super(message);
    this.name = "RiskTreatmentError";
  }
}

/**
 * "accept" defaults straight to "completed" -- accepting a risk IS the
 * completed action, not the start of one. Every other treatment type
 * defaults to "proposed," since avoiding/mitigating/transferring a
 * risk is real work that hasn't happened yet just because someone
 * proposed it.
 */
export async function proposeRiskTreatment(
  repo: RiskIntelligenceRepository,
  input: { insightId: string; treatmentType: RiskTreatmentType; description: string; proposedByStaffId: string },
  now: Date = new Date(),
): Promise<RiskTreatment> {
  const insight = await repo.getInsightById(input.insightId);
  if (!insight) {
    throw new RiskTreatmentError(`No insight with id "${input.insightId}"`, "insight_not_found");
  }

  const isAccept = input.treatmentType === "accept";
  const treatment: RiskTreatment = {
    id: randomUUID(),
    insightId: input.insightId,
    treatmentType: input.treatmentType,
    description: input.description,
    status: isAccept ? "completed" : "proposed",
    proposedByStaffId: input.proposedByStaffId,
    proposedAt: now,
    completedAt: isAccept ? now : null,
  };
  await repo.createRiskTreatment(treatment);
  return treatment;
}

export async function listTreatmentsForInsight(repo: RiskIntelligenceRepository, insightId: string): Promise<RiskTreatment[]> {
  const insight = await repo.getInsightById(insightId);
  if (!insight) {
    throw new RiskTreatmentError(`No insight with id "${insightId}"`, "insight_not_found");
  }
  return repo.listRiskTreatmentsForInsight(insightId);
}

export async function listRiskTreatments(
  repo: RiskIntelligenceRepository,
  opts?: { treatmentType?: RiskTreatmentType; status?: RiskTreatmentStatus; limit?: number },
): Promise<RiskTreatment[]> {
  return repo.listRiskTreatments(opts);
}

/**
 * Moves a treatment through proposed -> in_progress -> completed.
 * Setting status to "completed" records completedAt now, unless the
 * caller already has one (letting a caller backdate a completion
 * that actually happened earlier -- e.g. importing a treatment that
 * was already finished before Command Center tracked it at all).
 */
export async function updateTreatmentStatus(
  repo: RiskIntelligenceRepository,
  treatmentId: string,
  status: RiskTreatmentStatus,
  now: Date = new Date(),
): Promise<RiskTreatment> {
  const existing = await repo.getRiskTreatmentById(treatmentId);
  if (!existing) {
    throw new RiskTreatmentError(`No treatment with id "${treatmentId}"`, "treatment_not_found");
  }

  const updated: RiskTreatment = {
    ...existing,
    status,
    completedAt: status === "completed" ? (existing.completedAt ?? now) : existing.completedAt,
  };
  await repo.updateRiskTreatment(updated);
  return updated;
}
