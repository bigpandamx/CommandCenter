/**
 * Extracted Route Handler logic for Governance proxy routes. Zero
 * dependency on next/headers or next/server -- see routeHandler.ts's
 * own doc comment for why that's the whole point of this split.
 */
import {
  createPolicy,
  setPolicyStatus,
  addControlToPolicy,
  removeControlFromPolicy,
  reportViolation,
  resolveViolation,
  dismissViolation,
  approveRequest,
  rejectRequest,
  requestApprovalsFromTask,
  attachEvidence,
  removeEvidence,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleCreatePolicy(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  return toRouteResult(
    () => createPolicy(apiClientConfig(sessionToken), { key: parsed.key as string, name: parsed.name as string, description: parsed.description as string }),
    201,
  );
}

export async function handleSetPolicyStatus(sessionToken: string | null, policyKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { status?: unknown } | null;
  if (!parsed || (parsed.status !== "draft" && parsed.status !== "active" && parsed.status !== "retired")) {
    return invalidRequest();
  }
  return toRouteResult(() => setPolicyStatus(apiClientConfig(sessionToken), policyKey, parsed.status as "draft" | "active" | "retired"), 200);
}

export async function handleAddControlToPolicy(sessionToken: string | null, policyKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { controlKey?: unknown } | null;
  if (!parsed || typeof parsed.controlKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addControlToPolicy(apiClientConfig(sessionToken), policyKey, parsed.controlKey as string);
    return null;
  }, 204);
}

export async function handleRemoveControlFromPolicy(sessionToken: string | null, policyKey: string, controlKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeControlFromPolicy(apiClientConfig(sessionToken), policyKey, controlKey);
    return null;
  }, 204);
}

export async function handleReportViolation(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { policyId?: unknown; organizationId?: unknown; description?: unknown; severity?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.policyId !== "string" ||
    typeof parsed.description !== "string" ||
    (parsed.severity !== "low" && parsed.severity !== "medium" && parsed.severity !== "high" && parsed.severity !== "critical")
  ) {
    return invalidRequest();
  }
  const organizationId = typeof parsed.organizationId === "string" ? parsed.organizationId : null;
  return toRouteResult(
    () =>
      reportViolation(apiClientConfig(sessionToken), {
        policyId: parsed.policyId as string,
        organizationId,
        description: parsed.description as string,
        severity: parsed.severity as "low" | "medium" | "high" | "critical",
      }),
    201,
  );
}

export async function handleResolveViolation(sessionToken: string | null, violationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { resolutionNotes?: unknown } | null;
  if (!parsed || typeof parsed.resolutionNotes !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => resolveViolation(apiClientConfig(sessionToken), violationId, parsed.resolutionNotes as string), 200);
}

export async function handleDismissViolation(sessionToken: string | null, violationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { resolutionNotes?: unknown } | null;
  if (!parsed || typeof parsed.resolutionNotes !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => dismissViolation(apiClientConfig(sessionToken), violationId, parsed.resolutionNotes as string), 200);
}

export async function handleApproveApprovalRequest(sessionToken: string | null, requestId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { decisionNotes?: unknown } | null;
  const decisionNotes = parsed && typeof parsed.decisionNotes === "string" ? parsed.decisionNotes : null;
  return toRouteResult(() => approveRequest(apiClientConfig(sessionToken), requestId, decisionNotes), 200);
}

export async function handleRejectApprovalRequest(sessionToken: string | null, requestId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { decisionNotes?: unknown } | null;
  const decisionNotes = parsed && typeof parsed.decisionNotes === "string" ? parsed.decisionNotes : null;
  return toRouteResult(() => rejectRequest(apiClientConfig(sessionToken), requestId, decisionNotes), 200);
}

export async function handleRequestApprovalsFromTask(sessionToken: string | null, taskId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => requestApprovalsFromTask(apiClientConfig(sessionToken), taskId), 201);
}

export async function handleAttachEvidence(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as
    | { targetType?: unknown; targetId?: unknown; evidenceType?: unknown; description?: unknown; referenceUrl?: unknown }
    | null;
  if (
    !parsed ||
    typeof parsed.targetType !== "string" ||
    typeof parsed.targetId !== "string" ||
    typeof parsed.description !== "string" ||
    (parsed.evidenceType !== "document" &&
      parsed.evidenceType !== "log_reference" &&
      parsed.evidenceType !== "attestation" &&
      parsed.evidenceType !== "other")
  ) {
    return invalidRequest();
  }
  const referenceUrl = typeof parsed.referenceUrl === "string" ? parsed.referenceUrl : null;
  return toRouteResult(
    () =>
      attachEvidence(apiClientConfig(sessionToken), {
        targetType: parsed.targetType as string,
        targetId: parsed.targetId as string,
        evidenceType: parsed.evidenceType as "document" | "log_reference" | "attestation" | "other",
        description: parsed.description as string,
        referenceUrl,
      }),
    201,
  );
}

export async function handleRemoveEvidence(sessionToken: string | null, evidenceId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeEvidence(apiClientConfig(sessionToken), evidenceId);
    return null;
  }, 204);
}
