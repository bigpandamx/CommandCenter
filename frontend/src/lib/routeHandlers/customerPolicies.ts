/**
 * Extracted Route Handler logic for Customer Policy proxy routes. Zero
 * dependency on next/headers or next/server -- see routeHandler.ts's
 * own doc comment for why that's the whole point of this split.
 */
import {
  submitCustomerPolicy,
  markCustomerPolicyReviewed,
  rejectCustomerPolicy,
  addControlToCustomerPolicy,
  removeControlFromCustomerPolicy,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleSubmitCustomerPolicy(sessionToken: string | null, organizationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { name?: unknown; description?: unknown; documentUrl?: unknown } | null;
  if (!parsed || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  const documentUrl = typeof parsed.documentUrl === "string" ? parsed.documentUrl : null;
  return toRouteResult(
    () => submitCustomerPolicy(apiClientConfig(sessionToken), organizationId, { name: parsed.name as string, description: parsed.description as string, documentUrl }),
    201,
  );
}

export async function handleReviewCustomerPolicy(sessionToken: string | null, policyId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { reviewNotes?: unknown } | null;
  const reviewNotes = parsed && typeof parsed.reviewNotes === "string" ? parsed.reviewNotes : null;
  return toRouteResult(() => markCustomerPolicyReviewed(apiClientConfig(sessionToken), policyId, reviewNotes), 200);
}

export async function handleRejectCustomerPolicy(sessionToken: string | null, policyId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { reviewNotes?: unknown } | null;
  const reviewNotes = parsed && typeof parsed.reviewNotes === "string" ? parsed.reviewNotes : null;
  return toRouteResult(() => rejectCustomerPolicy(apiClientConfig(sessionToken), policyId, reviewNotes), 200);
}

export async function handleAddControlToCustomerPolicy(sessionToken: string | null, policyId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { controlKey?: unknown } | null;
  if (!parsed || typeof parsed.controlKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addControlToCustomerPolicy(apiClientConfig(sessionToken), policyId, parsed.controlKey as string);
    return null;
  }, 204);
}

export async function handleRemoveControlFromCustomerPolicy(sessionToken: string | null, policyId: string, controlKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeControlFromCustomerPolicy(apiClientConfig(sessionToken), policyId, controlKey);
    return null;
  }, 204);
}
