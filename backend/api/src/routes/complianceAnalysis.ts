/**
 * Control-Plane/Compliance AI Analysis routes -- separate from
 * compliance.ts because this depends on an AIProvider, which (like
 * Customer-Connections/AIChat) is only registered when configured, not
 * a hard requirement for the rest of Compliance to function.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  analyzeComplianceUpdate,
  analyzeUnanalyzedUpdates,
  ComplianceAnalysisError,
} from "../../../Control-Plane/Compliance/src/analysisService.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const batchSchema = z.object({ limit: z.number().int().positive().optional() });

const analysisErrorStatus: Record<ComplianceAnalysisError["code"], number> = {
  update_not_found: 404,
  invalid_ai_response: 502, // the AI provider misbehaved -- a bad upstream response, not a client mistake
};

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

export function registerComplianceAnalysisRoutes(
  app: FastifyInstance,
  repo: ComplianceRepository,
  aiProvider: AIProvider,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.post("/v1/admin/compliance/updates/:updateId/analyze", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        const analysis = await analyzeComplianceUpdate(repo, aiProvider, updateId);
        return reply.status(200).send(analysis);
      } catch (err) {
        if (err instanceof ComplianceAnalysisError) {
          return reply.status(analysisErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });

    scopedApp.get("/v1/admin/compliance/updates/:updateId/analysis", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { updateId } = request.params as { updateId: string };
      const analysis = await repo.getAnalysisForUpdate(updateId);
      if (!analysis) {
        return reply.status(404).send({ error: "not_analyzed" });
      }
      return reply.status(200).send(analysis);
    });

    // Batch: works through everything unanalyzed, up to `limit` (default
    // 20 -- deliberately conservative for a manually-triggered staff
    // action, not tuned for a bulk backlog; a scheduler running this
    // periodically is a reasonable future step, not built this round).
    scopedApp.post("/v1/admin/compliance/analyze", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const parsed = batchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const summary = await analyzeUnanalyzedUpdates(repo, aiProvider, parsed.data.limit ?? 20);
      return reply.status(200).send(summary);
    });
  });
}
