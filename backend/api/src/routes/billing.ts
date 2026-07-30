/**
 * Platform-Services/Subscriptions billing admin routes: plan catalog, org
 * subscription lifecycle, usage/quota reporting. Same staff-session +
 * RBAC gating pattern as organizations.ts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createPlan,
  subscribeOrganization,
  changeSubscriptionPlan,
  cancelSubscription,
  getPlanForSubscription,
  BillingError,
} from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import { getQuotaUsage } from "../../../Platform-Services/Subscriptions/src/usageService.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";

const createPlanSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  billingCycle: z.enum(["monthly", "quarterly", "annual", "usage_based"]),
  basePriceCents: z.number().int(),
  currency: z.string().optional(),
  monthlyTokenQuota: z.number().int().optional(),
  monthlyRequestQuota: z.number().int().optional(),
  maxDevices: z.number().int().optional(),
  allowedChannels: z.array(z.enum(["stable", "beta", "canary"])),
});

const subscribeSchema = z.object({ planCode: z.string().min(1) });

const billingErrorStatus: Record<BillingError["code"], number> = {
  plan_not_found: 404,
  plan_inactive: 409,
  duplicate_plan_code: 409,
  organization_not_found: 404,
  no_active_subscription: 404,
  already_subscribed: 409,
  plan_missing_stripe_price: 422,
  stripe_subscription_customer_mismatch: 422,
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

export function registerBillingRoutes(
  app: FastifyInstance,
  repo: BillingRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.get("/v1/admin/billing/plans", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:read")) return;
    const plans = await repo.listPlans();
    return reply.status(200).send({ plans });
  });

  scopedApp.post("/v1/admin/billing/plans", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:manage")) return;
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const plan = await createPlan(repo, parsed.data as Parameters<typeof createPlan>[1]);
      return reply.status(201).send(plan);
    } catch (err) {
      if (err instanceof BillingError) {
        return reply.status(billingErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/organizations/:organizationId/subscription", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:manage")) return;
    const { organizationId } = request.params as { organizationId: string };
    const parsed = subscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const subscription = await subscribeOrganization(repo, organizationId, parsed.data.planCode);
      return reply.status(201).send(subscription);
    } catch (err) {
      if (err instanceof BillingError) {
        return reply.status(billingErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/organizations/:organizationId/subscription", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:manage")) return;
    const { organizationId } = request.params as { organizationId: string };
    const parsed = subscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const subscription = await changeSubscriptionPlan(repo, organizationId, parsed.data.planCode);
      return reply.status(200).send(subscription);
    } catch (err) {
      if (err instanceof BillingError) {
        return reply.status(billingErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.delete("/v1/admin/organizations/:organizationId/subscription", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:manage")) return;
    const { organizationId } = request.params as { organizationId: string };
    try {
      await cancelSubscription(repo, organizationId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof BillingError) {
        return reply.status(billingErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/organizations/:organizationId/usage", async (request, reply) => {
    if (!checkPermission(request, reply, "billing:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const subscription = await repo.getActiveSubscriptionForOrg(organizationId);
    if (!subscription) {
      return reply.status(404).send({ error: "no_active_subscription" });
    }
    const plan = await getPlanForSubscription(repo, subscription);
    const usage = await getQuotaUsage(repo, subscription);
    return reply.status(200).send({ planCode: plan.code, subscriptionStatus: subscription.status, usage });
  });
  });
}
