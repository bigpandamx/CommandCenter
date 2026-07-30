/**
 * Service Catalog admin routes.
 *
 * Read (browsing the catalog, viewing an org's computed state) is
 * available to any staff role; catalog/bundle mutations and org-facing
 * purchase actions are admin-only -- same blast-radius reasoning as
 * feature_flag:manage and billing:manage: a wrongly-configured tier
 * matrix or a wrongly-attached add-on affects real customer access and
 * real billing, not just a display.
 *
 * The org-facing routes (catalog/tier-progression/entitlements/attach/
 * cancel) all resolve the org's current plan code internally via
 * billingRepo, the same way the existing /usage route already does --
 * callers never need to separately look up and pass a plan code.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  addDependency,
  addServiceToBundle,
  attachAddOn,
  attachBundle,
  cancelAddOn,
  cancelBundle,
  computeCatalogForOrganization,
  computeCategorizedCatalogForOrganization,
  computeFinalEntitlements,
  computeNavigationForOrganization,
  computeTierProgression,
  createBundle,
  createCategory,
  createService,
  editService,
  listServiceDependencies,
  disableService,
  listBundles,
  listCategories,
  listServices,
  removeDependency,
  removeServiceFromBundle,
  resolveDependencyRequirements,
  resolveDisableOverride,
  setTierAvailability,
} from "../../../Platform-Services/ServiceCatalog/src/serviceCatalogService.js";
import { ServiceCatalogError, type ServiceAvailability } from "../../../Platform-Services/ServiceCatalog/src/types.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { FeatureFlagsRepository } from "../../../Platform-Services/FeatureFlags/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { getPlanForSubscription } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

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

const catalogErrorStatus: Record<ServiceCatalogError["code"], number> = {
  service_not_found: 404,
  bundle_not_found: 404,
  category_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  plan_not_found: 409,
  selection_not_found: 404,
  dependency_not_satisfied: 409,
};

function handleCatalogError(reply: FastifyReply, err: unknown) {
  if (err instanceof ServiceCatalogError) {
    return reply.status(catalogErrorStatus[err.code]).send({
      error: err.code,
      message: err.message,
      ...(err.unsatisfiedDependencies
        ? {
            unsatisfiedDependencies: err.unsatisfiedDependencies.map((r) => ({
              key: r.service.key,
              name: r.service.name,
              status: r.status,
              requiresPlanCode: r.requiresPlanCode,
              reason: r.reason,
            })),
          }
        : {}),
    });
  }
  throw err;
}

/**
 * Resolves an org's current plan code via its active subscription --
 * the same lookup the existing /usage route already performs. Returns
 * null (not a throw) when there's no active subscription, so callers
 * can render a clear "no active subscription" state instead of a 500.
 */
async function resolveOrgPlanCode(billingRepo: BillingRepository, organizationId: string): Promise<string | null> {
  const subscription = await billingRepo.getActiveSubscriptionForOrg(organizationId);
  if (!subscription) return null;
  const plan = await getPlanForSubscription(billingRepo, subscription);
  return plan.code;
}

const createCategorySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  displayOrder: z.number().int(),
  navigationPath: z.string().nullish(),
  icon: z.string().nullish(),
  color: z.string().nullish(),
  requiredPermission: z.string().nullish(),
});

const createServiceSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  minimumPlanCode: z.string().nullish(),
  defaultAddOnStripePriceId: z.string().nullish(),
  isAddOnEligible: z.boolean().optional(),
  supportsTrial: z.boolean().optional(),
  monthlyPriceCents: z.number().int().nonnegative().nullish(),
  usageMeterKey: z.string().nullish(),
  entitlementKey: z.string().nullish(),
  featureFlagKey: z.string().nullish(),
  navigationPath: z.string().nullish(),
  icon: z.string().nullish(),
  color: z.string().nullish(),
  requiredPermission: z.string().nullish(),
});

const editServiceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  minimumPlanCode: z.string().nullish(),
  defaultAddOnStripePriceId: z.string().nullish(),
  isAddOnEligible: z.boolean().optional(),
  supportsTrial: z.boolean().optional(),
  monthlyPriceCents: z.number().int().nonnegative().nullish(),
  usageMeterKey: z.string().nullish(),
  entitlementKey: z.string().nullish(),
  featureFlagKey: z.string().nullish(),
  navigationPath: z.string().nullish(),
  icon: z.string().nullish(),
  color: z.string().nullish(),
  requiredPermission: z.string().nullish(),
});

const setTierAvailabilitySchema = z.object({
  planCode: z.string().min(1),
  availabilityType: z.enum(["included", "addable", "unavailable"] as const),
  addOnStripePriceId: z.string().nullish(),
});

const dependencySchema = z.object({ dependsOnServiceKey: z.string().min(1) });

const disableServiceSchema = z.object({
  organizationId: z.string().uuid().nullish(),
  reason: z.string().min(1),
  cause: z.enum(["maintenance", "policy", "admin_action"] as const),
  estimatedResolution: z.string().nullish(),
});

const createBundleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  minimumPlanCode: z.string().nullish(),
  monthlyPriceCents: z.number().int().nonnegative().nullish(),
  stripePriceId: z.string().nullish(),
  supportsTrial: z.boolean().optional(),
});

const bundleServiceSchema = z.object({ serviceKey: z.string().min(1) });

const attachSchema = z.object({
  trial: z.boolean().optional(),
  trialDurationDays: z.number().int().positive().optional(),
  autoResolveDependencies: z.boolean().optional(),
});

/** Groups a computed catalog into the buckets the Organization View screen actually renders -- "Locked Services" (upgrade required) and "Optional Add-ons" (purchasable now) are different sections, not one merged "locked" list. */
function groupCatalog(entries: Array<{ service: { key: string; name: string; category: string }; availability: ServiceAvailability }>) {
  const available: unknown[] = [];
  const trial: unknown[] = [];
  const requiresUpgrade: unknown[] = [];
  const availableAddOns: unknown[] = [];
  const disabled: unknown[] = [];

  for (const { service, availability } of entries) {
    const base = { key: service.key, name: service.name, category: service.category };
    if (availability.state === "available") {
      available.push({ ...base, source: availability.source });
    } else if (availability.state === "trial") {
      trial.push({ ...base, expiresAt: availability.expiresAt.toISOString(), daysRemaining: availability.daysRemaining });
    } else if (availability.state === "disabled") {
      disabled.push({ ...base, reason: availability.reason, cause: availability.cause, estimatedResolution: availability.estimatedResolution?.toISOString() ?? null });
    } else if (availability.state === "locked" && availability.unlockPath.type === "upgrade_tier") {
      requiresUpgrade.push({ ...base, reason: availability.reason, requiresPlanCode: availability.unlockPath.targetPlanCode });
    } else if (availability.state === "locked" && availability.unlockPath.type === "add_on") {
      availableAddOns.push({ ...base, addOnStripePriceId: availability.unlockPath.addOnStripePriceId });
    }
  }

  return { available, trial, requiresUpgrade, availableAddOns, disabled };
}

export function registerServiceCatalogAdminRoutes(
  app: FastifyInstance,
  catalogRepo: ServiceCatalogRepository,
  featureFlagsRepo: FeatureFlagsRepository,
  billingRepo: BillingRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    // ---- Category management ----

    scopedApp.get("/v1/admin/categories", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const categories = await listCategories(catalogRepo, { activeOnly: false });
      return reply.status(200).send({ categories });
    });

    scopedApp.post("/v1/admin/categories", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const parsed = createCategorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const category = await createCategory(catalogRepo, parsed.data);
        return reply.status(201).send(category);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    // ---- Service management ----

    scopedApp.get("/v1/admin/services", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const services = await listServices(catalogRepo, { activeOnly: false });
      return reply.status(200).send({ services });
    });

    scopedApp.post("/v1/admin/services", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const parsed = createServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const service = await createService(catalogRepo, parsed.data);
        return reply.status(201).send(service);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/services/:key/edit", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = editServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const service = await editService(catalogRepo, key, parsed.data);
        return reply.status(200).send(service);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    // Resolved to full Service objects -- what the Service Editor's
    // edit mode needs to know which dependency checkboxes are
    // currently checked.
    scopedApp.get("/v1/admin/services/:key/dependencies", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { key } = request.params as { key: string };
      try {
        const dependencies = await listServiceDependencies(catalogRepo, key);
        return reply.status(200).send({ dependencies });
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/services/:key/tier-availability", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = setTierAvailabilitySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const entry = await setTierAvailability(catalogRepo, key, parsed.data.planCode, parsed.data.availabilityType, parsed.data.addOnStripePriceId);
        return reply.status(200).send(entry);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/services/:key/dependencies", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = dependencySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addDependency(catalogRepo, key, parsed.data.dependsOnServiceKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.delete("/v1/admin/services/:key/dependencies/:dependsOnKey", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key, dependsOnKey } = request.params as { key: string; dependsOnKey: string };
      try {
        await removeDependency(catalogRepo, key, dependsOnKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/services/:key/disable", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = disableServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const override = await disableService(catalogRepo, key, {
          organizationId: parsed.data.organizationId,
          reason: parsed.data.reason,
          cause: parsed.data.cause,
          estimatedResolution: parsed.data.estimatedResolution ? new Date(parsed.data.estimatedResolution) : null,
          createdBy: user.id,
        });
        return reply.status(201).send(override);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/disable-overrides/:id/resolve", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { id } = request.params as { id: string };
      await resolveDisableOverride(catalogRepo, id);
      return reply.status(204).send();
    });

    // ---- Bundle management ----

    scopedApp.get("/v1/admin/bundles", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const bundles = await listBundles(catalogRepo, { activeOnly: false });
      return reply.status(200).send({ bundles });
    });

    scopedApp.post("/v1/admin/bundles", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const parsed = createBundleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const bundle = await createBundle(catalogRepo, parsed.data);
        return reply.status(201).send(bundle);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/bundles/:key/services", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = bundleServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addServiceToBundle(catalogRepo, key, parsed.data.serviceKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.delete("/v1/admin/bundles/:key/services/:serviceKey", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { key, serviceKey } = request.params as { key: string; serviceKey: string };
      try {
        await removeServiceFromBundle(catalogRepo, key, serviceKey);
        return reply.status(204).send();
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    // ---- Org-facing views: Organization View + Tier Progression Dashboard ----

    scopedApp.get("/v1/admin/organizations/:organizationId/catalog", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      const entries = await computeCatalogForOrganization(catalogRepo, organizationId, planCode);
      return reply.status(200).send({ planCode, ...groupCatalog(entries) });
    });

    // Same underlying per-service computation as /catalog above, just
    // grouped by category instead of by availability state -- the
    // browsing view for a catalog that's grown past a flat list. See
    // computeCategorizedCatalogForOrganization's own doc comment for
    // the Uncategorized-fallback and empty-category-omission rules.
    scopedApp.get("/v1/admin/organizations/:organizationId/catalog/by-category", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      const groups = await computeCategorizedCatalogForOrganization(catalogRepo, organizationId, planCode);
      return reply.status(200).send({
        planCode,
        groups: groups.map((g) => ({
          category: g.category ? { key: g.category.key, name: g.category.name } : null,
          entries: g.entries.map(({ service, availability }) => {
            const base = { key: service.key, name: service.name };
            if (availability.state === "available") return { ...base, state: "available" as const };
            if (availability.state === "trial") return { ...base, state: "trial" as const, expiresAt: availability.expiresAt.toISOString(), daysRemaining: availability.daysRemaining };
            if (availability.state === "disabled") return { ...base, state: "disabled" as const, reason: availability.reason };
            return {
              ...base,
              state: "locked" as const,
              unlockType: availability.unlockPath.type,
              ...(availability.unlockPath.type === "upgrade_tier" ? { requiresPlanCode: availability.unlockPath.targetPlanCode } : {}),
            };
          }),
        })),
      });
    });

    scopedApp.get("/v1/admin/organizations/:organizationId/tier-progression", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      try {
        const progression = await computeTierProgression(catalogRepo, organizationId, planCode);
        return reply.status(200).send({
          planCode,
          progression: progression.map((entry) => ({
            planCode: entry.planCode,
            unlocksServices: entry.unlocksServices.map((s) => ({ key: s.key, name: s.name, category: s.category })),
          })),
        });
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/organizations/:organizationId/entitlements", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      const entitlements = await computeFinalEntitlements(catalogRepo, featureFlagsRepo, organizationId, planCode);
      return reply.status(200).send({ planCode, entitlements: [...entitlements] });
    });

    // "Give me my catalog" -- what lets Aegis's frontend build its
    // navigation dynamically instead of hardcoding it. Only categories
    // with navigationPath set become entries; state is a rollup across
    // that category's services for this org (trial > enabled > locked).
    scopedApp.get("/v1/admin/organizations/:organizationId/navigation", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      const navigation = await computeNavigationForOrganization(catalogRepo, organizationId, planCode);
      return reply.status(200).send({ planCode, navigation });
    });

    // ---- Org-facing purchase actions (admin-assisted) ----

    // Preview -- "would attaching this work, and if not, exactly why" --
    // meant to be called before the attach action itself, so a UI can
    // show "this also requires Analytics" and get confirmation before
    // committing to attachAddOn's autoResolveDependencies: true.
    scopedApp.get("/v1/admin/organizations/:organizationId/services/:key/dependency-requirements", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:read")) return;
      const { organizationId, key } = request.params as { organizationId: string; key: string };
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      try {
        const requirements = await resolveDependencyRequirements(catalogRepo, organizationId, key, planCode);
        return reply.status(200).send({
          planCode,
          requirements: requirements.map((r) => ({
            key: r.service.key,
            name: r.service.name,
            status: r.status,
            requiresPlanCode: r.requiresPlanCode,
            reason: r.reason,
          })),
        });
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/organizations/:organizationId/services/:key/attach", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { organizationId, key } = request.params as { organizationId: string; key: string };
      const parsed = attachSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      try {
        const selection = await attachAddOn(catalogRepo, organizationId, key, planCode, parsed.data);
        return reply.status(201).send(selection);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/organizations/:organizationId/services/:key/cancel", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { organizationId, key } = request.params as { organizationId: string; key: string };
      try {
        const selection = await cancelAddOn(catalogRepo, organizationId, key);
        return reply.status(200).send(selection);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/organizations/:organizationId/bundles/:key/attach", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { organizationId, key } = request.params as { organizationId: string; key: string };
      const parsed = attachSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const planCode = await resolveOrgPlanCode(billingRepo, organizationId);
      if (!planCode) {
        return reply.status(404).send({ error: "no_active_subscription" });
      }
      try {
        const selection = await attachBundle(catalogRepo, organizationId, key, planCode, parsed.data);
        return reply.status(201).send(selection);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/organizations/:organizationId/bundles/:key/cancel", async (request, reply) => {
      if (!checkPermission(request, reply, "service_catalog:manage")) return;
      const { organizationId, key } = request.params as { organizationId: string; key: string };
      try {
        const selection = await cancelBundle(catalogRepo, organizationId, key);
        return reply.status(200).send(selection);
      } catch (err) {
        return handleCatalogError(reply, err);
      }
    });
  });
}
