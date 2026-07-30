import { runJobNow, updateJobSchedule } from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { notAuthenticated, toRouteResult, invalidRequest, type RouteResult } from "../routeHandler";

export async function handleRunJobNow(sessionToken: string | null, jobKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => runJobNow(apiClientConfig(sessionToken), jobKey), 201);
}

export async function handleUpdateJobSchedule(sessionToken: string | null, jobKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { intervalMinutes?: unknown; enabled?: unknown } | null;
  if (!parsed || typeof parsed.intervalMinutes !== "number" || typeof parsed.enabled !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(
    () => updateJobSchedule(apiClientConfig(sessionToken), jobKey, { intervalMinutes: parsed.intervalMinutes as number, enabled: parsed.enabled as boolean }),
    200,
  );
}
