/**
 * Compliance Operations Dashboard admin route -- the single screen a
 * compliance team opens every morning. compliance:read, same
 * permission as every other Compliance browsing surface -- this is a
 * read-only aggregate view, no new permission needed.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeComplianceOperationsDashboard } from "../../../Control-Plane/ComplianceOperations/src/dashboardService.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function checkPermission(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, "compliance:read");
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

export function registerComplianceOperationsRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  announcementsRepo: AnnouncementsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/operations-dashboard", async (request, reply) => {
      if (!checkPermission(request, reply)) return;
      const dashboard = await computeComplianceOperationsDashboard(
        complianceRepo,
        orgsRepo,
        catalogRepo,
        billingRepo,
        announcementsRepo,
      );
      return reply.status(200).send(dashboard);
    });
  });
}
