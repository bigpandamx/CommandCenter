import {
  processNextAgentTask,
  listAgents,
  getAgentTask,
  listAgentTasks,
  submitAgentTask,
  type AgentCapability,
  type AgentTaskPriority,
  type AgentTaskStatus,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleProcess(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => processNextAgentTask(apiClientConfig(sessionToken)), 200);
}

export async function handleListAgents(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => listAgents(apiClientConfig(sessionToken)), 200);
}

export async function handleGetTask(sessionToken: string | null, taskId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => getAgentTask(apiClientConfig(sessionToken), taskId), 200);
}

export async function handleListTasks(
  sessionToken: string | null,
  query: { capability?: string | null; status?: string | null; limit?: string | null },
): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(
    () =>
      listAgentTasks(apiClientConfig(sessionToken), {
        capability: (query.capability as AgentCapability) ?? undefined,
        status: (query.status as AgentTaskStatus) ?? undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    200,
  );
}

export async function handleSubmitTask(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = body as { capability?: unknown; priority?: unknown } | null;
  if (!parsed || typeof parsed.capability !== "string") {
    return invalidRequest();
  }

  return toRouteResult(
    () =>
      submitAgentTask(apiClientConfig(sessionToken), {
        capability: parsed.capability as AgentCapability,
        priority: parsed.priority as AgentTaskPriority | undefined,
      }),
    201,
  );
}
