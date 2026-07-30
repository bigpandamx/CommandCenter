import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  ObligationReviewError,
  approveObligation,
  rejectObligation,
  resetObligationToPendingReview,
  editObligation,
  mergeObligation,
} from "../../../Control-Plane/Compliance/src/obligationReviewService.js";

const reviewErrorStatus: Record<ObligationReviewError["code"], number> = {
  obligation_not_found: 404,
  cannot_merge_into_self: 400,
  target_not_found: 404,
};

function handleReviewError(reply: FastifyReply, err: unknown) {
  if (err instanceof ObligationReviewError) {
    return reply.status(reviewErrorStatus[err.code]).send({ error: err.code, message: err.message });
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

const editSchema = z.object({
  description: z.string().min(1).optional(),
  obligationType: z.string().min(1).optional(),
  industries: z.array(z.string()).optional(),
  deadlineDescription: z.string().nullish(),
});

const mergeSchema = z.object({ targetObligationId: z.string().min(1) });

export function registerObligationReviewRoutes(app: FastifyInstance, complianceRepo: ComplianceRepository, staffAuthRepo: StaffAuthRepository): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/approve", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      try {
        const obligation = await approveObligation(complianceRepo, obligationId);
        return reply.status(200).send(obligation);
      } catch (err) {
        return handleReviewError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/reject", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      try {
        const obligation = await rejectObligation(complianceRepo, obligationId);
        return reply.status(200).send(obligation);
      } catch (err) {
        return handleReviewError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/reset", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      try {
        const obligation = await resetObligationToPendingReview(complianceRepo, obligationId);
        return reply.status(200).send(obligation);
      } catch (err) {
        return handleReviewError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/edit", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      const parsed = editSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const obligation = await editObligation(complianceRepo, obligationId, parsed.data);
        return reply.status(200).send(obligation);
      } catch (err) {
        return handleReviewError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/merge", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      const parsed = mergeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const obligation = await mergeObligation(complianceRepo, obligationId, parsed.data.targetObligationId);
        return reply.status(200).send(obligation);
      } catch (err) {
        return handleReviewError(reply, err);
      }
    });
  });
}
