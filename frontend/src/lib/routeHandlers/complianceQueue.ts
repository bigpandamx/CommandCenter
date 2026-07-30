/**
 * Extracted Route Handler logic for Incoming Queue proxy routes. Zero
 * dependency on next/headers or next/server -- see routeHandler.ts's
 * own doc comment for why that's the whole point of this split.
 */
import {
  markUpdatePendingReview,
  markUpdateAsDuplicate,
  rejectComplianceUpdate,
  publishComplianceUpdate,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleMarkPendingReview(sessionToken: string | null, updateId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => markUpdatePendingReview(apiClientConfig(sessionToken), updateId), 200);
}

export async function handleMarkAsDuplicate(sessionToken: string | null, updateId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => markUpdateAsDuplicate(apiClientConfig(sessionToken), updateId), 200);
}

export async function handleReject(sessionToken: string | null, updateId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => rejectComplianceUpdate(apiClientConfig(sessionToken), updateId), 200);
}

export async function handlePublish(sessionToken: string | null, updateId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => publishComplianceUpdate(apiClientConfig(sessionToken), updateId), 200);
}
