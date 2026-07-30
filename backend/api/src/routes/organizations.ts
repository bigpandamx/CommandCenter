/**
 * Control-Plane/Organizations admin routes: create orgs, issue/revoke
 * enrollment tokens, view license usage. Gated by real staff sessions
 * (requireStaffSession) plus per-route RBAC (requirePermission) -- replaces
 * the earlier requireInternalKey shared-secret placeholder now that
 * Platform-Services/Authentication's staff auth exists.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createOrganization,
  issueEnrollmentToken,
  revokeEnrollmentToken,
  setEntitlementTier,
  OrganizationNotFoundError,
} from "../../../Control-Plane/Organizations/src/organizationService.js";
import { signUpOrganization, SignupError } from "../../../Control-Plane/Organizations/src/signup.js";
import {
  getOrganizationWithProfile,
  searchOrganizations,
  updateOrganizationProfile,
  ProfileError,
} from "../../../Control-Plane/Organizations/src/profileSearch.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import { deviceUsage } from "../../../Platform-Services/Subscriptions/src/enforcement.js";
import { resolveEntitlementPolicy } from "../../../Platform-Services/Subscriptions/src/resolvePolicy.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { DesktopSyncRepository } from "../../../Customer-Connections/Desktop-Apps/src/repository.js";
import type { TelemetryRepository } from "../../../Customer-Connections/Desktop-Apps/src/telemetryRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
  entitlementTier: z.enum(["trial", "standard", "enterprise"]),
});

const issueTokenSchema = z.object({
  organizationId: z.string().uuid(),
  maxUses: z.number().int().positive().optional(),
  expiresInSeconds: z.number().int().positive().optional(),
});

const updateTierSchema = z.object({
  entitlementTier: z.enum(["trial", "standard", "enterprise"]),
});

const companySizes = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

const signupSchema = z.object({
  organizationName: z.string().min(1),
  primaryContactName: z.string().min(1),
  primaryContactEmail: z.string().min(1),
  primaryContactPhone: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.enum(companySizes).optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  slug: z.string().optional(),
});

const updateProfileSchema = z.object({
  primaryContactName: z.string().min(1).optional(),
  primaryContactEmail: z.string().min(1).optional(),
  primaryContactPhone: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.enum(companySizes).optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

/** Returns true (and lets the caller continue) if the role has the permission; otherwise writes a 403 and returns false. */
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

export function registerOrganizationsRoutes(
  app: FastifyInstance,
  repo: OrganizationsRepository,
  desktopSyncRepo: Pick<DesktopSyncRepository, "countActiveDevicesForOrg">,
  staffAuthRepo: StaffAuthRepository,
  telemetryRepo: TelemetryRepository,
  billingRepo: BillingRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/organizations", async (request, reply) => {
    if (!checkPermission(request, reply, "org:create")) return;
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const org = await createOrganization(repo, parsed.data as Parameters<typeof createOrganization>[1]);
    return reply.status(201).send(org);
  });

  scopedApp.get("/v1/admin/organizations", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const orgs = await repo.listOrganizations();
    return reply.status(200).send({ organizations: orgs });
  });

  // Staff-facing sign-up intake -- e.g. Aegis sales/support manually
  // onboarding a prospect during a call. The equivalent service-facing
  // path (Aegis's own backend relaying a customer's self-service sign-up
  // form) is POST /v1/service/organizations/signup, see serviceApi.ts --
  // both call the same signUpOrganization() domain function.
  scopedApp.post("/v1/admin/organizations/signup", async (request, reply) => {
    if (!checkPermission(request, reply, "org:create")) return;
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const result = await signUpOrganization(repo, parsed.data as Parameters<typeof signUpOrganization>[1]);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof SignupError) {
        return reply.status(400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Search must be registered as its own static route, not folded into
  // /:organizationId/... -- "search" would otherwise need to be excluded
  // from matching as an organizationId, which is exactly the kind of
  // routing footgun a dedicated path avoids entirely.
  scopedApp.get("/v1/admin/organizations/search", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const query = request.query as { text?: string; industry?: string; companySize?: string } | undefined;
    const results = await searchOrganizations(repo, {
      text: query?.text,
      industry: query?.industry,
      companySize: query?.companySize as Parameters<typeof searchOrganizations>[1]["companySize"],
    });
    return reply.status(200).send({ results });
  });

  scopedApp.get("/v1/admin/organizations/:organizationId/profile", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    try {
      const result = await getOrganizationWithProfile(repo, organizationId);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof ProfileError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/organizations/:organizationId/profile", async (request, reply) => {
    if (!checkPermission(request, reply, "org:set_entitlement")) return; // profile edits are an administrative action, same permission tier as entitlement changes
    const { organizationId } = request.params as { organizationId: string };
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const profile = await updateOrganizationProfile(repo, organizationId, parsed.data);
      return reply.status(200).send(profile);
    } catch (err) {
      if (err instanceof ProfileError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/organizations/:organizationId/entitlement", async (request, reply) => {
    if (!checkPermission(request, reply, "org:set_entitlement")) return;
    const { organizationId } = request.params as { organizationId: string };
    const parsed = updateTierSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      await setEntitlementTier(repo, organizationId, parsed.data.entitlementTier as "trial" | "standard" | "enterprise");
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof OrganizationNotFoundError) {
        return reply.status(404).send({ error: "org_not_found" });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/organizations/:organizationId/enrollment-tokens", async (request, reply) => {
    if (!checkPermission(request, reply, "enrollment_token:issue")) return;
    const { organizationId } = request.params as { organizationId: string };
    const parsed = issueTokenSchema.safeParse({ ...(request.body as object), organizationId });
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const token = await issueEnrollmentToken(repo, parsed.data);
      return reply.status(201).send(token);
    } catch (err) {
      if (err instanceof OrganizationNotFoundError) {
        return reply.status(404).send({ error: "org_not_found" });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/organizations/:organizationId/enrollment-tokens", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const tokens = await repo.listEnrollmentTokens(organizationId);
    return reply.status(200).send({ tokens });
  });

  scopedApp.get("/v1/admin/organizations/:organizationId/license-usage", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const org = await repo.getOrganization(organizationId);
    if (!org) {
      return reply.status(404).send({ error: "org_not_found" });
    }
    const policy = await resolveEntitlementPolicy(billingRepo, org);
    const activeDeviceCount = await desktopSyncRepo.countActiveDevicesForOrg(organizationId);
    return reply.status(200).send({
      tier: policy.tier,
      allowedChannels: policy.allowedChannels,
      devices: deviceUsage(policy, activeDeviceCount),
    });
  });

  scopedApp.get("/v1/admin/organizations/:organizationId/telemetry", async (request, reply) => {
    if (!checkPermission(request, reply, "org:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const query = request.query as { since?: string; limit?: string } | undefined;
    const events = await telemetryRepo.listEventsForOrg(organizationId, {
      since: query?.since ? new Date(query.since) : undefined,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ events });
  });

  scopedApp.delete("/v1/admin/enrollment-tokens/:token", async (request, reply) => {
    if (!checkPermission(request, reply, "enrollment_token:revoke")) return;
    const { token } = request.params as { token: string };
    await revokeEnrollmentToken(repo, token);
    return reply.status(204).send();
  });
  });
}
