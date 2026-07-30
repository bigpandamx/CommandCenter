/**
 * Extracted Route Handler logic for the Executive Dashboard proxy
 * route. Zero dependency on next/headers or next/server -- see
 * routeHandler.ts's own doc comment for why that's the whole point of
 * this split.
 */
import { getExecutiveDashboard } from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleGetExecutiveDashboard(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => getExecutiveDashboard(apiClientConfig(sessionToken)), 200);
}
