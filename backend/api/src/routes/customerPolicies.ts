import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  CustomerPolicyError,
  submitCustomerPolicy,
  listCustomerPoliciesForOrganization,
  markCustomerPolicyReviewed,
  rejectCustomerPolicy,
  addControlToCustomerPolicy,
  removeControlFromCustomerPolicy,
  listControlsForCustomerPolicy,
  listCustomerPoliciesForControl,
} from "../../../Control-Plane/Compliance/src/customerPolicyService.js";

const customerPolicyErrorStatus: Record<CustomerPolicyError["code"], number> = {
  policy_not_found: 404,
  control_not_found: 404,
  already_decided: 409,
};

function handleCustomerPolicyError(reply: FastifyReply, err: unknown) {
  if (err instanceof CustomerPolicyError) {
    return reply.status(customerPolicyErrorStatus[err.code]).send({ error: err.code, message: err.message });
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

const submitSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  documentUrl: z.string().nullish(),
});

const reviewSchema = z.object({ reviewNotes: z.string().nullish() });
const controlSchema = z.object({ controlKey: z.string().min(1) });
const listQuerySchema = z.object({ status: z.enum(["pending_review", "reviewed", "rejected"]).optional() });

export function registerCustomerPoliciesRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/organizations/:organizationId/customer-policies", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const policies = await listCustomerPoliciesForOrganization(complianceRepo, organizationId, parsed.data as { status?: "pending_review" | "reviewed" | "rejected" });
      return reply.status(200).send({ policies });
    });

    scopedApp.post("/v1/admin/organizations/:organizationId/customer-policies", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { organizationId } = request.params as { organizationId: string };
      const parsed = submitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      const policy = await submitCustomerPolicy(complianceRepo, {
        organizationId,
        name: parsed.data.name,
        description: parsed.data.description,
        documentUrl: parsed.data.documentUrl,
        submittedByStaffId: user.id,
      });
      return reply.status(201).send(policy);
    });

    scopedApp.post("/v1/admin/customer-policies/:id/review", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { id } = request.params as { id: string };
      const parsed = reviewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const policy = await markCustomerPolicyReviewed(complianceRepo, id, user.id, parsed.data.reviewNotes ?? null);
        return reply.status(200).send(policy);
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/customer-policies/:id/reject", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { id } = request.params as { id: string };
      const parsed = reviewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const policy = await rejectCustomerPolicy(complianceRepo, id, user.id, parsed.data.reviewNotes ?? null);
        return reply.status(200).send(policy);
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/customer-policies/:id/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { id } = request.params as { id: string };
      try {
        const controls = await listControlsForCustomerPolicy(complianceRepo, id);
        return reply.status(200).send({ controls });
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/customer-policies/:id/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { id } = request.params as { id: string };
      const parsed = controlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addControlToCustomerPolicy(complianceRepo, id, parsed.data.controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/customer-policies/:id/controls/:controlKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { id, controlKey } = request.params as { id: string; controlKey: string };
      try {
        await removeControlFromCustomerPolicy(complianceRepo, id, controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });

    // The reverse lookup -- which of any org's customer policies cover
    // a given control, alongside the control's existing
    // framework/pack mappings.
    scopedApp.get("/v1/admin/compliance/controls/:controlKey/customer-policies", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { controlKey } = request.params as { controlKey: string };
      try {
        const policies = await listCustomerPoliciesForControl(complianceRepo, controlKey);
        return reply.status(200).send({ policies });
      } catch (err) {
        return handleCustomerPolicyError(reply, err);
      }
    });
  });
}
