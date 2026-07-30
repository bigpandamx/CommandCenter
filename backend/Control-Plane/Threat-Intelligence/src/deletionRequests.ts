import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import { generateOrgHash } from "./privacy.js";
import { revokeConsent } from "./consent.js";

/**
 * GDPR Article 17 (right to erasure) deletion requests, mirroring
 * Aegis's `create_data_deletion_request` / `get_deletion_requests` /
 * `approve_and_execute_deletion`. One structural difference from
 * Aegis's version: Aegis tracks deletion requests as rows in
 * NetworkDataSharingLog itself (data_type="deletion_request", then
 * mutated to "deletion_completed" in place) -- workable, but it means
 * the audit log (which is supposed to be an append-only record of what
 * was shared) also does double duty as request-workflow state. This
 * version uses a dedicated table instead, so the audit log stays purely
 * append-only and the request workflow has its own clean lifecycle.
 *
 * What's actually deletable today reflects what Command Center actually
 * stores for an org: threat pattern observations (matched by
 * recomputing the org's hash, so if the hashing salt has ever rotated
 * since old observations were written, this can't find them anymore --
 * a real limitation, not silently ignored) and data-sharing audit log
 * entries. Aegis's own version also deletes RiskSignalAggregate rows,
 * which don't exist here yet (see CUTOVER.md -- that aggregation is a
 * later phase, not built).
 */

export type DeletionRequestStatus = "pending" | "completed" | "rejected";
export type DeletionDataType = "observations" | "sharing_logs";

export interface DeletionRequest {
  id: string;
  organizationId: string;
  reason: string | null;
  deleteAll: boolean;
  dataTypes: DeletionDataType[];
  status: DeletionRequestStatus;
  estimatedRecords: number;
  actualRecordsDeleted: number | null;
  requestedAt: Date;
  processedAt: Date | null;
  processedByStaffId: string | null;
}

export interface CreateDeletionRequestInput {
  reason?: string;
  deleteAll?: boolean;
  dataTypes?: DeletionDataType[];
}

export class DeletionRequestError extends Error {
  constructor(
    message: string,
    public readonly code: "request_not_found" | "already_processed",
  ) {
    super(message);
    this.name = "DeletionRequestError";
  }
}

function categoriesToCheck(deleteAll: boolean, dataTypes: DeletionDataType[]): { observations: boolean; sharingLogs: boolean } {
  return {
    observations: deleteAll || dataTypes.includes("observations"),
    sharingLogs: deleteAll || dataTypes.includes("sharing_logs"),
  };
}

export async function createDeletionRequest(
  repo: ThreatIntelRepository,
  organizationId: string,
  input: CreateDeletionRequestInput,
  orgHashSalt: string,
  now: Date = new Date(),
): Promise<DeletionRequest> {
  const deleteAll = input.deleteAll ?? true;
  const dataTypes = input.dataTypes ?? [];
  const { observations, sharingLogs } = categoriesToCheck(deleteAll, dataTypes);

  const organizationHash = generateOrgHash(organizationId, orgHashSalt);
  let estimatedRecords = 0;
  if (observations) {
    estimatedRecords += await repo.countObservationsForOrgHash(organizationHash);
  }
  if (sharingLogs) {
    estimatedRecords += await repo.countSharingLogsForOrg(organizationId);
  }

  const request: DeletionRequest = {
    id: randomUUID(),
    organizationId,
    reason: input.reason ?? null,
    deleteAll,
    dataTypes,
    status: "pending",
    estimatedRecords,
    actualRecordsDeleted: null,
    requestedAt: now,
    processedAt: null,
    processedByStaffId: null,
  };

  await repo.createDeletionRequest(request);
  return request;
}

export async function listDeletionRequests(
  repo: ThreatIntelRepository,
  organizationId: string,
): Promise<DeletionRequest[]> {
  return repo.listDeletionRequestsForOrg(organizationId);
}

/**
 * Approves and executes a pending deletion request: deletes the matching
 * observation and/or sharing-log rows, revokes the org's consent (a
 * completed erasure implies future sharing should stop too, not just
 * past data being wiped), and marks the request completed with the
 * actual record count deleted.
 */
export async function approveAndExecuteDeletion(
  repo: ThreatIntelRepository,
  requestId: string,
  approvedByStaffId: string,
  orgHashSalt: string,
  now: Date = new Date(),
): Promise<DeletionRequest> {
  const request = await repo.getDeletionRequestById(requestId);
  if (!request) {
    throw new DeletionRequestError(`Unknown deletion request: ${requestId}`, "request_not_found");
  }
  if (request.status !== "pending") {
    throw new DeletionRequestError(`Deletion request ${requestId} has already been processed`, "already_processed");
  }

  const { observations, sharingLogs } = categoriesToCheck(request.deleteAll, request.dataTypes);
  const organizationHash = generateOrgHash(request.organizationId, orgHashSalt);

  let recordsDeleted = 0;
  if (observations) {
    recordsDeleted += await repo.deleteObservationsForOrgHash(organizationHash);
  }
  if (sharingLogs) {
    recordsDeleted += await repo.deleteSharingLogsForOrg(request.organizationId);
  }

  await revokeConsent(repo, request.organizationId, now);

  const updated: DeletionRequest = {
    ...request,
    status: "completed",
    actualRecordsDeleted: recordsDeleted,
    processedAt: now,
    processedByStaffId: approvedByStaffId,
  };
  await repo.updateDeletionRequest(updated);
  return updated;
}

export async function rejectDeletionRequest(
  repo: ThreatIntelRepository,
  requestId: string,
  rejectedByStaffId: string,
  now: Date = new Date(),
): Promise<DeletionRequest> {
  const request = await repo.getDeletionRequestById(requestId);
  if (!request) {
    throw new DeletionRequestError(`Unknown deletion request: ${requestId}`, "request_not_found");
  }
  if (request.status !== "pending") {
    throw new DeletionRequestError(`Deletion request ${requestId} has already been processed`, "already_processed");
  }

  const updated: DeletionRequest = {
    ...request,
    status: "rejected",
    processedAt: now,
    processedByStaffId: rejectedByStaffId,
  };
  await repo.updateDeletionRequest(updated);
  return updated;
}
