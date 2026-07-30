/**
 * Control-Plane/ImpactAssessment admin routes -- separate from
 * compliance.ts because this depends on OrganizationsRepository, a
 * dependency the rest of Compliance's admin routes don't otherwise
 * need. Same staff-session + RBAC pattern as the rest of the admin
 * surface.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assessObligationImpact,
  findAffectedOrganizations,
} from "../../../Control-Plane/ImpactAssessment/src/impactEngine.js";
import { distributeObligationImpact } from "../../../Control-Plane/ImpactAssessment/src/distribution.js";
import { ImpactAssessmentError } from "../../../Control-Plane/ImpactAssessment/src/types.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const impactErrorStatus: Record<ImpactAssessmentError["code"], number> = {
  obligation_not_found: 404,
  update_not_found: 404,
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

export function registerImpactAssessmentRoutes(
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

    // Full result set -- affected AND excluded organizations, with why.
    // Useful for a staff member investigating a specific obligation's
    // reach, not just "who do I need to tell."
    scopedApp.get("/v1/admin/compliance/obligations/:obligationId/impact", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { obligationId } = request.params as { obligationId: string };
      try {
        const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligationId);
        return reply.status(200).send({ results });
      } catch (err) {
        if (err instanceof ImpactAssessmentError) {
          return reply.status(impactErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });

    // The narrower, more common case: only who's actually affected.
    scopedApp.get("/v1/admin/compliance/obligations/:obligationId/impact/affected", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { obligationId } = request.params as { obligationId: string };
      try {
        const results = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligationId);
        return reply.status(200).send({ results });
      } catch (err) {
        if (err instanceof ImpactAssessmentError) {
          return reply.status(impactErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });

    // Creates real, targeted Announcement rows -- one per affected org
    // -- as drafts. compliance:manage, not compliance:read, since this
    // is a write action (creates data), matching the same read/manage
    // split every other admin surface in this codebase already uses.
    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/impact/distribute", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      const user = getAuthenticatedStaffUser(request);
      try {
        const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligationId, user.id);
        return reply.status(201).send({ created });
      } catch (err) {
        if (err instanceof ImpactAssessmentError) {
          return reply.status(impactErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });
  });
}
