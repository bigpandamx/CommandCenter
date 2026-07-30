/**
 * The Incoming Queue: "think of this like an email inbox for
 * regulations." See ComplianceUpdateStatus's own doc comment
 * (types.ts) and 0039_compliance_update_status.sql for the full
 * reasoning behind the five states and why status isn't wired into
 * any downstream consumer yet.
 */
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceUpdate, ComplianceUpdateStatus } from "./types.js";

export class ComplianceQueueError extends Error {
  constructor(
    message: string,
    public readonly code: "update_not_found" | "invalid_transition",
  ) {
    super(message);
    this.name = "ComplianceQueueError";
  }
}

/**
 * The allowed state graph. "published" is terminal this round --
 * unpublishing/reverting a live item isn't modeled yet, deliberately:
 * status isn't wired into any downstream gating, so there's nothing a
 * revert would actually need to undo besides the label itself, and
 * adding real revert semantics before anything depends on the label
 * would be solving a problem that doesn't exist yet. "duplicate" and
 * "rejected" both allow a way back to "pending_review" -- staff
 * changing their mind about a flag is a normal inbox action (like
 * un-archiving an email), not something that should require deleting
 * and re-ingesting the document.
 */
const VALID_TRANSITIONS: Record<ComplianceUpdateStatus, ComplianceUpdateStatus[]> = {
  new: ["pending_review", "duplicate", "rejected"],
  pending_review: ["published", "duplicate", "rejected"],
  duplicate: ["pending_review"],
  rejected: ["pending_review"],
  published: [],
};

async function transitionUpdateStatus(repo: ComplianceRepository, updateId: string, to: ComplianceUpdateStatus): Promise<ComplianceUpdate> {
  const update = await repo.getUpdateById(updateId);
  if (!update) {
    throw new ComplianceQueueError(`Unknown compliance update: ${updateId}`, "update_not_found");
  }
  if (!VALID_TRANSITIONS[update.status].includes(to)) {
    throw new ComplianceQueueError(`Cannot move "${update.title}" from "${update.status}" to "${to}"`, "invalid_transition");
  }
  await repo.setUpdateStatus(updateId, to);
  return { ...update, status: to };
}

/** The explicit staff "undo" action for reversing a duplicate/rejected flag back to needing review. See advanceToReviewIfNew for the separate, more lenient function the AI analysis hook actually uses. */
export async function markPendingReview(repo: ComplianceRepository, updateId: string): Promise<ComplianceUpdate> {
  return transitionUpdateStatus(repo, updateId, "pending_review");
}

/**
 * The analysis hook specifically -- deliberately more lenient than
 * markPendingReview. Re-analyzing an update already at "pending_review"
 * (staff wants fresher results before deciding) must not throw just
 * because "pending_review -> pending_review" isn't a real transition;
 * a no-op is correct there. More importantly: an update a staff member
 * already explicitly rejected or flagged as a duplicate must NOT be
 * silently pulled back to "pending_review" just because a background
 * re-analysis happened to run -- that would overwrite a human decision
 * with an automatic side effect. Only actually transitions from "new".
 */
export async function advanceToReviewIfNew(repo: ComplianceRepository, updateId: string): Promise<void> {
  const update = await repo.getUpdateById(updateId);
  if (update && update.status === "new") {
    await repo.setUpdateStatus(updateId, "pending_review");
  }
}

export async function markAsDuplicate(repo: ComplianceRepository, updateId: string): Promise<ComplianceUpdate> {
  return transitionUpdateStatus(repo, updateId, "duplicate");
}

export async function rejectUpdate(repo: ComplianceRepository, updateId: string): Promise<ComplianceUpdate> {
  return transitionUpdateStatus(repo, updateId, "rejected");
}

export async function publishUpdate(repo: ComplianceRepository, updateId: string): Promise<ComplianceUpdate> {
  return transitionUpdateStatus(repo, updateId, "published");
}

export interface QueueSummary {
  new: number;
  pendingReview: number;
  duplicate: number;
  rejected: number;
  published: number;
}

/** The inbox's folder counts. Five separate queries over a client-side count rather than one dedicated aggregate method -- this system's data volume doesn't warrant the extra repository surface yet; worth revisiting if that changes. */
export async function getQueueSummary(repo: ComplianceRepository): Promise<QueueSummary> {
  const [newItems, pendingReview, duplicate, rejected, published] = await Promise.all([
    repo.listUpdates({ status: "new", limit: 100000 }),
    repo.listUpdates({ status: "pending_review", limit: 100000 }),
    repo.listUpdates({ status: "duplicate", limit: 100000 }),
    repo.listUpdates({ status: "rejected", limit: 100000 }),
    repo.listUpdates({ status: "published", limit: 100000 }),
  ]);
  return {
    new: newItems.length,
    pendingReview: pendingReview.length,
    duplicate: duplicate.length,
    rejected: rejected.length,
    published: published.length,
  };
}

export async function listUpdatesByStatus(repo: ComplianceRepository, status: ComplianceUpdateStatus, opts?: { limit?: number }): Promise<ComplianceUpdate[]> {
  return repo.listUpdates({ status, limit: opts?.limit });
}
