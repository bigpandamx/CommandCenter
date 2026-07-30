import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  ComplianceControlError,
  createControl,
  listControls,
  mapObligationToControl,
  unmapObligationFromControl,
  listControlsForObligation,
  listObligationsForControl,
} from "../../../Control-Plane/Compliance/src/controlService.js";
import { ControlMatchingError, matchObligationToControlLibrary } from "../../../Control-Plane/Compliance/src/controlMatching.js";
import {
  computeControlLibraryStats,
  computeControlLibraryStatsForControl,
  ControlLibraryStatsError,
} from "../../../Control-Plane/ImpactAssessment/src/controlLibraryStats.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";

const controlErrorStatus: Record<ComplianceControlError["code"] | ControlMatchingError["code"] | ControlLibraryStatsError["code"], number> = {
  control_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  obligation_not_found: 404,
  invalid_ai_response: 502,
};

function handleControlError(reply: FastifyReply, err: unknown) {
  if (err instanceof ComplianceControlError || err instanceof ControlMatchingError || err instanceof ControlLibraryStatsError) {
    return reply.status(controlErrorStatus[err.code]).send({ error: err.code, message: err.message });
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

const createControlSchema = z.object({
  key: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

const mapSchema = z.object({ controlKey: z.string().min(1) });

export function registerComplianceControlsRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  organizationsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  staffAuthRepo: StaffAuthRepository,
  aiProvider: AIProvider | null,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const controls = await listControls(complianceRepo);
      return reply.status(200).send({ controls });
    });

    scopedApp.post("/v1/admin/compliance/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const parsed = createControlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const control = await createControl(complianceRepo, parsed.data);
        return reply.status(201).send(control);
      } catch (err) {
        return handleControlError(reply, err);
      }
    });

    // Control Library: internal-only aggregate intelligence, not
    // customer data. mappedObligationCount/organizationsImpactedCount
    // are real, computed from the same underlying mappings and Impact
    // Assessment logic every other Controls/Compliance view already
    // uses -- see controlLibraryStats.ts's own doc comment for the
    // union-not-sum reasoning and the stated performance tradeoff.
    scopedApp.get("/v1/admin/compliance/controls/library", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const stats = await computeControlLibraryStats(complianceRepo, organizationsRepo, catalogRepo, billingRepo);
      return reply.status(200).send({ stats });
    });

    scopedApp.get("/v1/admin/compliance/controls/:key/stats", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const stats = await computeControlLibraryStatsForControl(complianceRepo, organizationsRepo, catalogRepo, billingRepo, key);
        return reply.status(200).send(stats);
      } catch (err) {
        return handleControlError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/compliance/controls/:key/obligations", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const obligations = await listObligationsForControl(complianceRepo, key);
        return reply.status(200).send({ obligations });
      } catch (err) {
        return handleControlError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/compliance/obligations/:obligationId/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { obligationId } = request.params as { obligationId: string };
      const controls = await listControlsForObligation(complianceRepo, obligationId);
      return reply.status(200).send({ controls });
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId } = request.params as { obligationId: string };
      const parsed = mapSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await mapObligationToControl(complianceRepo, obligationId, parsed.data.controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleControlError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/obligations/:obligationId/controls/:controlKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { obligationId, controlKey } = request.params as { obligationId: string; controlKey: string };
      try {
        await unmapObligationFromControl(complianceRepo, obligationId, controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleControlError(reply, err);
      }
    });

    if (aiProvider) {
      scopedApp.post("/v1/admin/compliance/obligations/:obligationId/match-controls", async (request, reply) => {
        if (!checkPermission(request, reply, "compliance:manage")) return;
        const { obligationId } = request.params as { obligationId: string };
        try {
          const result = await matchObligationToControlLibrary(complianceRepo, aiProvider, obligationId);
          return reply.status(201).send(result);
        } catch (err) {
          return handleControlError(reply, err);
        }
      });
    }
  });
}
