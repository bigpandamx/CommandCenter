/**
 * Pending Approvals: converts a free-text agent recommendation into a
 * trackable decision. See types.ts's own doc comment on
 * ApprovalRequest and 0048_approval_requests.sql for the full
 * reasoning, including why conversion from AgentTask recommendations
 * is an explicit staff action here, not something the orchestrator
 * does automatically on every task completion.
 */
import { randomUUID } from "node:crypto";
import type { AgentsRepository } from "../../Agents/src/repository.js";
import type { GovernanceRepository } from "./repository.js";
import type { ApprovalRequest, ApprovalStatus } from "./types.js";

export class ApprovalRequestError extends Error {
  constructor(
    message: string,
    public readonly code: "request_not_found" | "already_decided" | "task_not_found" | "task_not_completed",
  ) {
    super(message);
    this.name = "ApprovalRequestError";
  }
}

/**
 * Idempotent on an existing PENDING request with the same
 * source+summary -- calling this twice for the same not-yet-decided
 * recommendation returns the existing request rather than creating a
 * visible duplicate. A summary that was already decided (approved or
 * rejected) gets a fresh request if it recurs -- a prior decision
 * doesn't mean a recurring issue stops needing attention.
 */
export async function requestApproval(
  repo: GovernanceRepository,
  input: { sourceType: string; sourceId: string; summary: string },
  now: Date = new Date(),
): Promise<ApprovalRequest> {
  const existing = await repo.getPendingApprovalRequestBySource(input.sourceType, input.sourceId, input.summary);
  if (existing) return existing;

  const request: ApprovalRequest = {
    id: randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    summary: input.summary,
    status: "pending",
    requestedAt: now,
    decidedByStaffId: null,
    decidedAt: null,
    decisionNotes: null,
  };
  await repo.createApprovalRequest(request);
  return request;
}

export async function listApprovalRequests(
  repo: GovernanceRepository,
  opts?: { status?: ApprovalStatus; sourceType?: string; limit?: number },
): Promise<ApprovalRequest[]> {
  return repo.listApprovalRequests(opts);
}

async function requirePendingRequest(repo: GovernanceRepository, id: string): Promise<ApprovalRequest> {
  const request = await repo.getApprovalRequestById(id);
  if (!request) {
    throw new ApprovalRequestError(`Unknown approval request: ${id}`, "request_not_found");
  }
  if (request.status !== "pending") {
    throw new ApprovalRequestError(`Request is already "${request.status}" -- only a pending request can be decided`, "already_decided");
  }
  return request;
}

/**
 * Terminal once decided, same reasoning as PolicyViolation's own
 * resolve/dismiss -- a decided approval is a closed decision with a
 * stated outcome; if the same recommendation recurs, requestApproval
 * files it as a fresh request rather than reopening this one.
 */
export async function approveRequest(
  repo: GovernanceRepository,
  id: string,
  staffId: string,
  decisionNotes: string | null = null,
  now: Date = new Date(),
): Promise<ApprovalRequest> {
  const request = await requirePendingRequest(repo, id);
  const updated: ApprovalRequest = { ...request, status: "approved", decidedByStaffId: staffId, decidedAt: now, decisionNotes };
  await repo.updateApprovalRequest(updated);
  return updated;
}

export async function rejectRequest(
  repo: GovernanceRepository,
  id: string,
  staffId: string,
  decisionNotes: string | null = null,
  now: Date = new Date(),
): Promise<ApprovalRequest> {
  const request = await requirePendingRequest(repo, id);
  const updated: ApprovalRequest = { ...request, status: "rejected", decidedByStaffId: staffId, decidedAt: now, decisionNotes };
  await repo.updateApprovalRequest(updated);
  return updated;
}

/**
 * The one real integration this round wires up: a completed
 * AgentTask's recommendations, turned into approval requests. Cross-
 * module by necessity (Governance doesn't own AgentTask), same
 * pattern ImpactAssessment's own packMatching.ts and
 * controlLibraryStats.ts already established for reading across a
 * module boundary rather than duplicating the data. Explicitly
 * staff-triggered -- see this file's own top comment for why the
 * orchestrator itself never calls this automatically.
 */
export async function createApprovalsFromTaskRecommendations(
  governanceRepo: GovernanceRepository,
  agentsRepo: AgentsRepository,
  taskId: string,
  now: Date = new Date(),
): Promise<ApprovalRequest[]> {
  const task = await agentsRepo.getTaskById(taskId);
  if (!task) {
    throw new ApprovalRequestError(`Unknown agent task: ${taskId}`, "task_not_found");
  }
  if (task.status !== "completed" || !task.result) {
    throw new ApprovalRequestError(`Task "${taskId}" is not completed -- only a completed task has recommendations to convert`, "task_not_completed");
  }

  const requests: ApprovalRequest[] = [];
  for (const recommendation of task.result.recommendations) {
    const request = await requestApproval(governanceRepo, { sourceType: "agent_recommendation", sourceId: task.id, summary: recommendation }, now);
    requests.push(request);
  }
  return requests;
}
