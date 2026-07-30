import { assignTicket, addTicketComment, changeTicketStatus, createTicket, type TicketStatus, type CreateTicketInput } from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleAssign(sessionToken: string | null, ticketId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { staffId?: unknown };
  const staffId = typeof parsed.staffId === "string" ? parsed.staffId : null;
  return toRouteResult(() => assignTicket(apiClientConfig(sessionToken), ticketId, staffId), 200);
}

export async function handleAddComment(sessionToken: string | null, ticketId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { body?: unknown };
  if (typeof parsed.body !== "string" || !parsed.body.trim()) {
    return invalidRequest();
  }
  return toRouteResult(() => addTicketComment(apiClientConfig(sessionToken), ticketId, parsed.body as string), 201);
}

export async function handleChangeStatus(sessionToken: string | null, ticketId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { status?: unknown };
  if (typeof parsed.status !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => changeTicketStatus(apiClientConfig(sessionToken), ticketId, parsed.status as TicketStatus), 200);
}

export async function handleCreate(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = body as { subject?: unknown; description?: unknown; category?: unknown } | null;
  if (!parsed || typeof parsed.subject !== "string" || typeof parsed.description !== "string" || typeof parsed.category !== "string") {
    return invalidRequest();
  }

  return toRouteResult(() => createTicket(apiClientConfig(sessionToken), parsed as unknown as CreateTicketInput), 201);
}
