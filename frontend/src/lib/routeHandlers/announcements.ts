import {
  acknowledgeAnnouncement,
  archiveAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  unscheduleAnnouncement,
  updateAnnouncement,
  getActiveAnnouncements,
  searchAnnouncements,
  createAnnouncement,
  type AnnouncementStatus,
  type AnnouncementAudience,
  type UpdateAnnouncementInput,
  type CreateAnnouncementInput,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleAcknowledge(sessionToken: string | null, announcementId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await acknowledgeAnnouncement(apiClientConfig(sessionToken), announcementId);
    return null;
  }, 204);
}

export async function handleArchive(sessionToken: string | null, announcementId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => archiveAnnouncement(apiClientConfig(sessionToken), announcementId), 200);
}

export async function handlePublish(sessionToken: string | null, announcementId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => publishAnnouncement(apiClientConfig(sessionToken), announcementId), 200);
}

export async function handleSchedule(sessionToken: string | null, announcementId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { publishAt?: unknown } | null;
  if (!parsed || typeof parsed.publishAt !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => scheduleAnnouncement(apiClientConfig(sessionToken), announcementId, parsed.publishAt as string), 200);
}

export async function handleUnschedule(sessionToken: string | null, announcementId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => unscheduleAnnouncement(apiClientConfig(sessionToken), announcementId), 200);
}

export async function handleUpdate(sessionToken: string | null, announcementId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(
    () => updateAnnouncement(apiClientConfig(sessionToken), announcementId, body as UpdateAnnouncementInput),
    200,
  );
}

export async function handleGetActive(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => getActiveAnnouncements(apiClientConfig(sessionToken)), 200);
}

export async function handleSearch(
  sessionToken: string | null,
  query: { status?: string | null; audience?: string | null },
): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(
    () =>
      searchAnnouncements(apiClientConfig(sessionToken), {
        status: (query.status as AnnouncementStatus) ?? undefined,
        audience: (query.audience as AnnouncementAudience) ?? undefined,
      }),
    200,
  );
}

export async function handleCreate(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = body as { title?: unknown; body?: unknown; audience?: unknown } | null;
  if (!parsed || typeof parsed.title !== "string" || typeof parsed.body !== "string" || typeof parsed.audience !== "string") {
    return invalidRequest();
  }

  return toRouteResult(() => createAnnouncement(apiClientConfig(sessionToken), parsed as unknown as CreateAnnouncementInput), 201);
}
