/**
 * Executive Dashboard admin route. Read-only aggregate across
 * Threat-Intelligence, Compliance, and Risk-Intelligence -- see
 * executiveDashboardService.ts's own top comment for the full
 * reasoning on scope, including which of the originally-requested
 * eight components are genuinely computed here versus explicitly not
 * built to avoid fabricating data no source in this codebase has.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getExecutiveDashboard } from "../../../Control-Plane/Executive-Dashboard/src/executiveDashboardService.js";
import type { ThreatIntelRepository } from "../../../Control-Plane/Threat-Intelligence/src/repository.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { RiskIntelligenceRepository } from "../../../Control-Plane/Risk-Intelligence/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function checkPermission(request: FastifyRequest, reply: FastifyReply, permission: Parameters<typeof assertPermission>[1]): boolean {
  try {
    const user = getAuthenticatedStaffUser(request);
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

export function registerExecutiveDashboardRoutes(
  app: FastifyInstance,
  threatIntelRepo: ThreatIntelRepository,
  complianceRepo: ComplianceRepository,
  riskIntelligenceRepo: RiskIntelligenceRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    // Gated on threat_intel:read alone, not all three of
    // threat_intel/compliance/risk_intel:read -- every role that has
    // any one of these today (viewer, operator) already has all
    // three bundled together, so requiring all three would add no
    // real restriction while adding real friction if that ever
    // changes.
    scopedApp.get("/v1/admin/executive-dashboard", async (request, reply) => {
      if (!checkPermission(request, reply, "threat_intel:read")) return;
      const dashboard = await getExecutiveDashboard(threatIntelRepo, complianceRepo, riskIntelligenceRepo);
      return reply.status(200).send(dashboard);
    });
  });
}
