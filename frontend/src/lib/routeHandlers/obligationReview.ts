/**
 * Extracted Route Handler logic for Obligation Review proxy routes.
 * Zero dependency on next/headers or next/server -- see
 * routeHandler.ts's own doc comment for why that's the whole point of
 * this split.
 */
import { approveObligation, rejectObligation, resetObligationToPendingReview, editObligation, mergeObligation } from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleApprove(sessionToken: string | null, obligationId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => approveObligation(apiClientConfig(sessionToken), obligationId), 200);
}

export async function handleRejectObligation(sessionToken: string | null, obligationId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => rejectObligation(apiClientConfig(sessionToken), obligationId), 200);
}

export async function handleReset(sessionToken: string | null, obligationId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => resetObligationToPendingReview(apiClientConfig(sessionToken), obligationId), 200);
}

export async function handleEdit(sessionToken: string | null, obligationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as
    | { description?: unknown; obligationType?: unknown; industries?: unknown; deadlineDescription?: unknown }
    | null;
  if (!parsed) return invalidRequest();
  const changes: { description?: string; obligationType?: string; industries?: string[]; deadlineDescription?: string | null } = {};
  if (typeof parsed.description === "string") changes.description = parsed.description;
  if (typeof parsed.obligationType === "string") changes.obligationType = parsed.obligationType;
  if (Array.isArray(parsed.industries) && parsed.industries.every((i) => typeof i === "string")) changes.industries = parsed.industries;
  if (parsed.deadlineDescription === null || typeof parsed.deadlineDescription === "string") changes.deadlineDescription = parsed.deadlineDescription;
  return toRouteResult(() => editObligation(apiClientConfig(sessionToken), obligationId, changes), 200);
}

export async function handleMerge(sessionToken: string | null, obligationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { targetObligationId?: unknown } | null;
  if (!parsed || typeof parsed.targetObligationId !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => mergeObligation(apiClientConfig(sessionToken), obligationId, parsed.targetObligationId as string), 200);
}
