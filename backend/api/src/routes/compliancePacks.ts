import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  CompliancePackError,
  createPack,
  listPacks,
  addControlToPack,
  removeControlFromPack,
  listControlsForPack,
} from "../../../Control-Plane/Compliance/src/packService.js";
import { computeApplicablePacksForOrganization } from "../../../Control-Plane/ImpactAssessment/src/packMatching.js";

const packErrorStatus: Record<CompliancePackError["code"], number> = {
  pack_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  control_not_found: 404,
};

function handlePackError(reply: FastifyReply, err: unknown) {
  if (err instanceof CompliancePackError) {
    return reply.status(packErrorStatus[err.code]).send({ error: err.code, message: err.message });
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

const createPackSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  requiredProductKeys: z.array(z.string()).optional(),
});

const controlSchema = z.object({ controlKey: z.string().min(1) });

export function registerCompliancePacksRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/packs", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const packs = await listPacks(complianceRepo);
      return reply.status(200).send({ packs });
    });

    scopedApp.post("/v1/admin/compliance/packs", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const parsed = createPackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const pack = await createPack(complianceRepo, parsed.data);
        return reply.status(201).send(pack);
      } catch (err) {
        return handlePackError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/compliance/packs/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const controls = await listControlsForPack(complianceRepo, key);
        return reply.status(200).send({ controls });
      } catch (err) {
        return handlePackError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/packs/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = controlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addControlToPack(complianceRepo, key, parsed.data.controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handlePackError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/packs/:key/controls/:controlKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key, controlKey } = request.params as { key: string; controlKey: string };
      try {
        await removeControlFromPack(complianceRepo, key, controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handlePackError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/organizations/:organizationId/compliance-packs", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const results = await computeApplicablePacksForOrganization(complianceRepo, catalogRepo, billingRepo, organizationId);
      return reply.status(200).send({ results });
    });
  });
}
