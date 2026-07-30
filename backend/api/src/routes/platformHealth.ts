/**
 * Platform Health admin routes -- internal-only operational
 * visibility, gated by platform_health:read. Nothing here is
 * customer-facing; nothing here is billed.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeQueueDepths, computeAiProviderHealth, computeTokenUsageByContext, computeLatencyByService } from "../../../Platform-Services/PlatformHealth/src/healthService.js";
import { computeDeploymentStatus, type StartupInfo } from "../../../Platform-Services/PlatformHealth/src/deploymentStatus.js";
import type { PlatformHealthRepository } from "../../../Platform-Services/PlatformHealth/src/repository.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { AgentsRepository } from "../../../Control-Plane/Agents/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const DEFAULT_WINDOW_MS = 3600_000; // 1 hour -- a reasonable default "recent" window for a health dashboard, not a claim about retention

function checkPermission(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, "platform_health:read");
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

function parseWindow(request: FastifyRequest): { windowStart: Date; windowEnd: Date } {
  const query = request.query as { since?: string; until?: string } | undefined;
  const windowEnd = query?.until ? new Date(query.until) : new Date();
  const windowStart = query?.since ? new Date(query.since) : new Date(windowEnd.getTime() - DEFAULT_WINDOW_MS);
  return { windowStart, windowEnd };
}

export function registerPlatformHealthRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  agentsRepo: AgentsRepository,
  platformHealthRepo: PlatformHealthRepository,
  startupInfo: StartupInfo,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/platform-health/queues", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const queues = await computeQueueDepths(complianceRepo, agentsRepo);
      return reply.status(200).send({ queues });
    });

    scopedApp.get("/v1/admin/platform-health/ai-provider", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const { windowStart, windowEnd } = parseWindow(request);
      const query = request.query as { context?: string } | undefined;
      const summary = await computeAiProviderHealth(platformHealthRepo, windowStart, windowEnd, query?.context);
      return reply.status(200).send(summary);
    });

    scopedApp.get("/v1/admin/platform-health/token-usage", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const { windowStart, windowEnd } = parseWindow(request);
      const breakdown = await computeTokenUsageByContext(platformHealthRepo, windowStart, windowEnd);
      return reply.status(200).send({ breakdown });
    });

    scopedApp.get("/v1/admin/platform-health/latency", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const { windowStart, windowEnd } = parseWindow(request);
      const byService = await computeLatencyByService(platformHealthRepo, windowStart, windowEnd);
      return reply.status(200).send({ byService });
    });

    scopedApp.get("/v1/admin/platform-health/deployment", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      return reply.status(200).send(computeDeploymentStatus(startupInfo));
    });
  });
}
