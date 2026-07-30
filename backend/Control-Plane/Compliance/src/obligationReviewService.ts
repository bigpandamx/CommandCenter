/**
 * Obligation Review: "your analysts verify before publishing." See
 * ObligationReviewStatus's own doc comment (types.ts) and
 * 0043_obligation_review.sql for the full reasoning -- one layer more
 * granular than the Incoming Queue (which reviews whether a DOCUMENT
 * should be looked at; this reviews whether a SPECIFIC extracted
 * requirement is accurate).
 *
 * Unlike ComplianceUpdate.status, this is a fully-connected 3-state
 * graph -- no state is terminal, no transition is disallowed. Nothing
 * downstream depends on the label yet (same deliberate scope boundary
 * as the Incoming Queue), so there's no consequence to guard against
 * by restricting which transitions are valid; a restrictive transition
 * table would add ceremony without adding real safety here.
 */
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceObligation } from "./types.js";
import { parseRelativeDeadline } from "./analysisService.js";

export class ObligationReviewError extends Error {
  constructor(
    message: string,
    public readonly code: "obligation_not_found" | "cannot_merge_into_self" | "target_not_found",
  ) {
    super(message);
    this.name = "ObligationReviewError";
  }
}

async function requireObligation(repo: ComplianceRepository, obligationId: string): Promise<ComplianceObligation> {
  const obligation = await repo.getObligationById(obligationId);
  if (!obligation) {
    throw new ObligationReviewError(`Unknown obligation: ${obligationId}`, "obligation_not_found");
  }
  return obligation;
}

export async function approveObligation(repo: ComplianceRepository, obligationId: string): Promise<ComplianceObligation> {
  const obligation = await requireObligation(repo, obligationId);
  const updated = { ...obligation, status: "approved" as const };
  await repo.updateObligation(updated);
  return updated;
}

export async function rejectObligation(repo: ComplianceRepository, obligationId: string): Promise<ComplianceObligation> {
  const obligation = await requireObligation(repo, obligationId);
  const updated = { ...obligation, status: "rejected" as const };
  await repo.updateObligation(updated);
  return updated;
}

/** The explicit staff "undo" action -- back to needing a decision, from either approved or rejected. */
export async function resetObligationToPendingReview(repo: ComplianceRepository, obligationId: string): Promise<ComplianceObligation> {
  const obligation = await requireObligation(repo, obligationId);
  const updated = { ...obligation, status: "pending_review" as const, mergedIntoObligationId: null };
  await repo.updateObligation(updated);
  return updated;
}

export interface EditObligationInput {
  description?: string;
  obligationType?: string;
  industries?: string[];
  deadlineDescription?: string | null;
}

/**
 * An edit does NOT change status -- correcting the AI's wording isn't
 * itself an approval decision; staff still explicitly approves
 * separately, even right after editing. If deadlineDescription
 * changes, deadlineDate is recomputed the same way the original
 * extraction computed it (parseRelativeDeadline against the parent
 * update's effectiveDate) -- an edited description shouldn't leave a
 * now-stale computed date behind.
 */
export async function editObligation(repo: ComplianceRepository, obligationId: string, changes: EditObligationInput): Promise<ComplianceObligation> {
  const obligation = await requireObligation(repo, obligationId);

  let deadlineDate = obligation.deadlineDate;
  if (changes.deadlineDescription !== undefined && changes.deadlineDescription !== obligation.deadlineDescription) {
    const update = await repo.getUpdateById(obligation.updateId);
    deadlineDate = parseRelativeDeadline(changes.deadlineDescription, update?.effectiveDate ?? null);
  }

  const updated: ComplianceObligation = {
    ...obligation,
    description: changes.description ?? obligation.description,
    obligationType: changes.obligationType ?? obligation.obligationType,
    industries: changes.industries ?? obligation.industries,
    deadlineDescription: changes.deadlineDescription !== undefined ? changes.deadlineDescription : obligation.deadlineDescription,
    deadlineDate,
  };
  await repo.updateObligation(updated);
  return updated;
}

/**
 * Non-destructive: no fields are combined, no data is deleted. The
 * source obligation is marked rejected and pointed at the target via
 * mergedIntoObligationId -- a relationship to record, not a data
 * transformation to perform. Existing control mappings on the source
 * (if any) are deliberately left as-is rather than auto-transferred to
 * the target; a merge is a statement about the obligations describing
 * the same requirement, not necessarily that their control mappings
 * were already identical.
 */
export async function mergeObligation(repo: ComplianceRepository, sourceObligationId: string, targetObligationId: string): Promise<ComplianceObligation> {
  if (sourceObligationId === targetObligationId) {
    throw new ObligationReviewError("An obligation cannot be merged into itself", "cannot_merge_into_self");
  }
  const source = await requireObligation(repo, sourceObligationId);
  const target = await repo.getObligationById(targetObligationId);
  if (!target) {
    throw new ObligationReviewError(`Unknown target obligation: ${targetObligationId}`, "target_not_found");
  }

  const updated: ComplianceObligation = { ...source, status: "rejected", mergedIntoObligationId: target.id };
  await repo.updateObligation(updated);
  return updated;
}
