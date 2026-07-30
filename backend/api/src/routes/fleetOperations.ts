/**
 * Fleet Operations admin routes -- the live fleet dashboard, gated by
 * fleet:read. Ingestion (Aegis instances reporting in) lives in
 * serviceApi.ts instead, gated by fleet:report -- a machine-to-machine
 * action, not a staff one.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeFleetSummary } from "../../../Control-Plane/FleetOperations/src/fleetService.js";
import type { FleetOperationsRepository } from "../../../Control-Plane/FleetOperations/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function checkPermission(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, "fleet:read");
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

export function registerFleetOperationsRoutes(
  app: FastifyInstance,
  fleetRepo: FleetOperationsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    // The live dashboard: one row per org that has ever reported in,
    // each marked stale or not.
    scopedApp.get("/v1/admin/fleet", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const query = request.query as { staleThresholdMs?: string } | undefined;
      const summary = await computeFleetSummary(
        fleetRepo,
        new Date(),
        query?.staleThresholdMs ? Number(query.staleThresholdMs) : undefined,
      );
      return reply.status(200).send({ instances: summary });
    });

    // Drill-down: one org's heartbeat history, for trend/staleness
    // investigation beyond just "what's true right now."
    scopedApp.get("/v1/admin/fleet/:organizationId/history", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const { organizationId } = request.params as { organizationId: string };
      const query = request.query as { limit?: string } | undefined;
      const history = await fleetRepo.listHeartbeatHistoryForOrg(organizationId, {
        limit: query?.limit ? Number(query.limit) : undefined,
      });
      return reply.status(200).send({ history });
    });
  });
}
