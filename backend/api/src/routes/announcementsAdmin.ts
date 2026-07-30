import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  acknowledgeAnnouncement,
  listUnacknowledgedAnnouncementsForStaff,
  scheduleAnnouncementPublish,
  unscheduleAnnouncementPublish,
  publishDueScheduledAnnouncements,
  AnnouncementError,
} from "../../../Control-Plane/Announcements/src/announcementService.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function checkPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: Parameters<typeof assertPermission>[1],
): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, permission);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

const announcementErrorStatus: Record<AnnouncementError["code"], number> = {
  not_found: 404,
  invalid_input: 400,
  invalid_status_transition: 409,
};

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(["staff", "customers", "all"]),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  expiresAt: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  audience: z.enum(["staff", "customers", "all"]).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  expiresAt: z.string().nullable().optional(),
});

const scheduleSchema = z.object({
  publishAt: z.string().min(1),
});

export function registerAnnouncementsAdminRoutes(
  app: FastifyInstance,
  repo: AnnouncementsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/announcements", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const staffUser = getAuthenticatedStaffUser(request);
    try {
      const announcement = await createAnnouncement(
        repo,
        {
          title: parsed.data.title,
          body: parsed.data.body,
          audience: parsed.data.audience,
          severity: parsed.data.severity,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        } as Parameters<typeof createAnnouncement>[1],
        staffUser.id,
      );
      return reply.status(201).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/announcements", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:read")) return;
    const query = request.query as { status?: string; audience?: string; limit?: string } | undefined;
    const announcements = await repo.searchAnnouncements({
      status: query?.status as Parameters<typeof repo.searchAnnouncements>[0]["status"],
      audience: query?.audience as Parameters<typeof repo.searchAnnouncements>[0]["audience"],
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ announcements });
  });

  scopedApp.get("/v1/admin/announcements/active", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:read")) return;
    // Unacknowledged, not just active -- this is what the banner
    // renders, and a staff member shouldn't keep seeing something
    // they've already dismissed. Use /v1/admin/announcements?status=published
    // for the full active set regardless of who's seen it.
    const staffUser = getAuthenticatedStaffUser(request);
    const announcements = await listUnacknowledgedAnnouncementsForStaff(repo, staffUser.id);
    return reply.status(200).send({ announcements });
  });

  scopedApp.post("/v1/admin/announcements/:id/acknowledge", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:read")) return;
    const { id } = request.params as { id: string };
    const staffUser = getAuthenticatedStaffUser(request);
    try {
      await acknowledgeAnnouncement(repo, id, staffUser.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/announcements/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const announcement = await updateAnnouncement(repo, id, {
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience,
        severity: parsed.data.severity,
        expiresAt:
          parsed.data.expiresAt === undefined
            ? undefined
            : parsed.data.expiresAt === null
              ? null
              : new Date(parsed.data.expiresAt),
      } as Parameters<typeof updateAnnouncement>[2]);
      return reply.status(200).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/announcements/:id/publish", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const announcement = await publishAnnouncement(repo, id);
      return reply.status(200).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Distribution Center: "Tomorrow" and "Schedule" both call this --
  // the UI computes publishAt differently for each ("same time
  // tomorrow" vs. a staff-picked date/time), but the backend action is
  // identical either way.
  scopedApp.post("/v1/admin/announcements/:id/schedule", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const announcement = await scheduleAnnouncementPublish(repo, id, new Date(parsed.data.publishAt));
      return reply.status(200).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Distribution Center: the "Draft" option, when applied to something
  // currently scheduled -- reverts to a plain, unscheduled draft.
  scopedApp.post("/v1/admin/announcements/:id/unschedule", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const announcement = await unscheduleAnnouncementPublish(repo, id);
      return reply.status(200).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Manual trigger for publishDueScheduledAnnouncements -- see its own
  // doc comment: no live cron/timer runs this automatically yet, same
  // "not yet done" tier as Compliance's own ingestion scheduler. This
  // gives staff a way to force an immediate check before that's wired
  // up, or just to confirm a schedule actually fired.
  scopedApp.post("/v1/admin/announcements/publish-due", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const results = await publishDueScheduledAnnouncements(repo);
    return reply.status(200).send({ results });
  });

  scopedApp.post("/v1/admin/announcements/:id/archive", async (request, reply) => {
    if (!checkPermission(request, reply, "announcements:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const announcement = await archiveAnnouncement(repo, id);
      return reply.status(200).send(announcement);
    } catch (err) {
      if (err instanceof AnnouncementError) {
        return reply.status(announcementErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
  });
}
