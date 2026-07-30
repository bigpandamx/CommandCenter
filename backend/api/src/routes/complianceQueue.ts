import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { ComplianceUpdateStatus } from "../../../Control-Plane/Compliance/src/types.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  ComplianceQueueError,
  getQueueSummary,
  listUpdatesByStatus,
  markPendingReview,
  markAsDuplicate,
  rejectUpdate,
  publishUpdate,
} from "../../../Control-Plane/Compliance/src/queueService.js";

const queueErrorStatus: Record<ComplianceQueueError["code"], number> = {
  update_not_found: 404,
  invalid_transition: 409,
};

function handleQueueError(reply: FastifyReply, err: unknown) {
  if (err instanceof ComplianceQueueError) {
    return reply.status(queueErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  throw err;
}

function checkPermission(request: FastifyRequest, reply: FastifyReply, permission: Parameters<typeof assertPermission>[1]): boolean {
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

const VALID_STATUSES: ComplianceUpdateStatus[] = ["new", "pending_review", "duplicate", "rejected", "published"];

export function registerComplianceQueueRoutes(app: FastifyInstance, complianceRepo: ComplianceRepository, staffAuthRepo: StaffAuthRepository): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/queue/summary", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const summary = await getQueueSummary(complianceRepo);
      return reply.status(200).send(summary);
    });

    scopedApp.get("/v1/admin/compliance/queue/:status", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { status } = request.params as { status: string };
      if (!VALID_STATUSES.includes(status as ComplianceUpdateStatus)) {
        return reply.status(400).send({ error: "invalid_status", validStatuses: VALID_STATUSES });
      }
      const updates = await listUpdatesByStatus(complianceRepo, status as ComplianceUpdateStatus);
      return reply.status(200).send({ updates });
    });

    scopedApp.post("/v1/admin/compliance/updates/:updateId/mark-pending-review", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        const update = await markPendingReview(complianceRepo, updateId);
        return reply.status(200).send(update);
      } catch (err) {
        return handleQueueError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/updates/:updateId/mark-duplicate", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        const update = await markAsDuplicate(complianceRepo, updateId);
        return reply.status(200).send(update);
      } catch (err) {
        return handleQueueError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/updates/:updateId/reject", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        const update = await rejectUpdate(complianceRepo, updateId);
        return reply.status(200).send(update);
      } catch (err) {
        return handleQueueError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/updates/:updateId/publish", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        const update = await publishUpdate(complianceRepo, updateId);
        return reply.status(200).send(update);
      } catch (err) {
        return handleQueueError(reply, err);
      }
    });
  });
}
