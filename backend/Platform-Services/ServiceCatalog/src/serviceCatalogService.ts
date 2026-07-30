/**
 * Service Catalog domain logic.
 *
 * computeServiceAvailability is the actual point of this module -- see
 * its own doc comment for the full precedence rules. Everything else
 * here is catalog/matrix/selection management: the data this
 * computation reads.
 */

import { randomUUID } from "node:crypto";
import { isFeatureEnabled } from "../../FeatureFlags/src/featureFlagService.js";
import type { FeatureFlagsRepository } from "../../FeatureFlags/src/repository.js";
import type { ServiceCatalogRepository } from "./repository.js";
import {
  ServiceCatalogError,
  type Category,
  type DependencyRequirement,
  type DisableCause,
  type OrgBundleSelection,
  type OrgServiceSelection,
  type Service,
  type ServiceAvailability,
  type ServiceDisableOverride,
  type ServiceTierAvailability,
  type SolutionBundle,
  type TierAvailabilityType,
} from "./types.js";

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------
// Categories: a managed, ordered list, not free text -- see
// 0032_service_categories.sql for the full reasoning on why this
// doesn't hard-constrain Service.category at the DB level.
// ---------------------------------------------------------------------

export async function createCategory(
  repo: ServiceCatalogRepository,
  input: {
    key: string;
    name: string;
    displayOrder: number;
    navigationPath?: string | null;
    icon?: string | null;
    color?: string | null;
    requiredPermission?: string | null;
  },
): Promise<Category> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ServiceCatalogError(`Invalid category key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai")`, "invalid_key");
  }
  const existing = await repo.getCategoryByKey(input.key);
  if (existing) {
    throw new ServiceCatalogError(`A category with key "${input.key}" already exists`, "duplicate_key");
  }

  const category: Category = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    displayOrder: input.displayOrder,
    isActive: true,
    navigationPath: input.navigationPath ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    requiredPermission: input.requiredPermission ?? null,
  };
  await repo.createCategory(category);
  return category;
}

export async function listCategories(repo: ServiceCatalogRepository, opts?: { activeOnly?: boolean }): Promise<Category[]> {
  return repo.listCategories(opts);
}

// ---------------------------------------------------------------------
// Catalog management
// ---------------------------------------------------------------------

export async function createService(
  repo: ServiceCatalogRepository,
  input: {
    key: string;
    name: string;
    description: string;
    category: string;
    minimumPlanCode?: string | null;
    defaultAddOnStripePriceId?: string | null;
    isAddOnEligible?: boolean;
    supportsTrial?: boolean;
    monthlyPriceCents?: number | null;
    usageMeterKey?: string | null;
    entitlementKey?: string | null;
    featureFlagKey?: string | null;
    navigationPath?: string | null;
    icon?: string | null;
    color?: string | null;
    requiredPermission?: string | null;
  },
): Promise<Service> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ServiceCatalogError(
      `Invalid service key "${input.key}" -- must be lowercase-with-dashes (e.g. "developer-sandbox")`,
      "invalid_key",
    );
  }
  const existing = await repo.getServiceByKey(input.key);
  if (existing) {
    throw new ServiceCatalogError(`A service with key "${input.key}" already exists`, "duplicate_key");
  }

  const service: Service = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    category: input.category,
    isActive: true,
    minimumPlanCode: input.minimumPlanCode ?? null,
    defaultAddOnStripePriceId: input.defaultAddOnStripePriceId ?? null,
    isAddOnEligible: input.isAddOnEligible ?? true,
    supportsTrial: input.supportsTrial ?? true,
    monthlyPriceCents: input.monthlyPriceCents ?? null,
    usageMeterKey: input.usageMeterKey ?? null,
    entitlementKey: input.entitlementKey ?? null,
    featureFlagKey: input.featureFlagKey ?? null,
    navigationPath: input.navigationPath ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    requiredPermission: input.requiredPermission ?? null,
  };
  await repo.createService(service);
  return service;
}

export async function listServices(repo: ServiceCatalogRepository, opts?: { activeOnly?: boolean }): Promise<Service[]> {
  return repo.listServices(opts);
}

export interface EditServiceInput {
  name?: string;
  description?: string;
  category?: string;
  isActive?: boolean;
  minimumPlanCode?: string | null;
  defaultAddOnStripePriceId?: string | null;
  isAddOnEligible?: boolean;
  supportsTrial?: boolean;
  monthlyPriceCents?: number | null;
  usageMeterKey?: string | null;
  entitlementKey?: string | null;
  featureFlagKey?: string | null;
  navigationPath?: string | null;
  icon?: string | null;
  color?: string | null;
  requiredPermission?: string | null;
}

/**
 * A partial update -- every field is optional, and an omitted field
 * keeps its current value. `key` is deliberately not editable here:
 * it's the stable identifier dependencies, bundles, and tier-
 * availability rows all reference directly (see Service.key's own
 * doc comment) -- changing it after creation would silently break
 * every existing reference rather than update them. Renaming a
 * service means retiring the old key (isActive: false) and creating a
 * new one, not mutating the key in place.
 *
 * Nullable fields distinguish "omitted" (undefined, keep as-is) from
 * "explicitly cleared" (null) the same way editObligation already
 * does -- `input.icon === undefined` keeps the existing icon,
 * `input.icon === null` clears it.
 */
export async function editService(repo: ServiceCatalogRepository, key: string, input: EditServiceInput): Promise<Service> {
  const service = await requireServiceByKey(repo, key);

  const updated: Service = {
    ...service,
    name: input.name ?? service.name,
    description: input.description ?? service.description,
    category: input.category ?? service.category,
    isActive: input.isActive ?? service.isActive,
    minimumPlanCode: input.minimumPlanCode !== undefined ? input.minimumPlanCode : service.minimumPlanCode,
    defaultAddOnStripePriceId: input.defaultAddOnStripePriceId !== undefined ? input.defaultAddOnStripePriceId : service.defaultAddOnStripePriceId,
    isAddOnEligible: input.isAddOnEligible ?? service.isAddOnEligible,
    supportsTrial: input.supportsTrial ?? service.supportsTrial,
    monthlyPriceCents: input.monthlyPriceCents !== undefined ? input.monthlyPriceCents : service.monthlyPriceCents,
    usageMeterKey: input.usageMeterKey !== undefined ? input.usageMeterKey : service.usageMeterKey,
    entitlementKey: input.entitlementKey !== undefined ? input.entitlementKey : service.entitlementKey,
    featureFlagKey: input.featureFlagKey !== undefined ? input.featureFlagKey : service.featureFlagKey,
    navigationPath: input.navigationPath !== undefined ? input.navigationPath : service.navigationPath,
    icon: input.icon !== undefined ? input.icon : service.icon,
    color: input.color !== undefined ? input.color : service.color,
    requiredPermission: input.requiredPermission !== undefined ? input.requiredPermission : service.requiredPermission,
  };
  await repo.updateService(updated);
  return updated;
}

/** Resolved to full Service objects -- what the Service Editor's edit mode needs to know which dependency checkboxes are currently checked. */
export async function listServiceDependencies(repo: ServiceCatalogRepository, key: string): Promise<Service[]> {
  const service = await requireServiceByKey(repo, key);
  const dependencyIds = await repo.listDirectDependencies(service.id);
  const dependencies: Service[] = [];
  for (const id of dependencyIds) {
    const dep = await repo.getServiceById(id);
    if (dep) dependencies.push(dep);
  }
  return dependencies;
}

async function requireServiceByKey(repo: ServiceCatalogRepository, key: string): Promise<Service> {
  const service = await repo.getServiceByKey(key);
  if (!service) {
    throw new ServiceCatalogError(`No service with key "${key}"`, "service_not_found");
  }
  return service;
}

/**
 * Sets (creates or updates) one cell of the tier matrix -- the actual
 * "no new code" mechanism the whole catalog exists for. Calling this
 * again for the same (service, plan) updates the existing row rather
 * than erroring, since re-pointing a service from "addable" to
 * "included" as a tier's offering evolves is an expected, routine
 * catalog operation, not an exceptional one.
 */
export async function setTierAvailability(
  repo: ServiceCatalogRepository,
  serviceKey: string,
  planCode: string,
  availabilityType: TierAvailabilityType,
  addOnStripePriceId?: string | null,
): Promise<ServiceTierAvailability> {
  const service = await requireServiceByKey(repo, serviceKey);
  const existing = await repo.getTierAvailability(service.id, planCode);

  const entry: ServiceTierAvailability = {
    id: existing?.id ?? randomUUID(),
    serviceId: service.id,
    planCode,
    availabilityType,
    addOnStripePriceId: availabilityType === "addable" ? (addOnStripePriceId ?? null) : null,
  };
  await repo.setTierAvailability(entry);
  return entry;
}

// ---------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------

export async function addDependency(repo: ServiceCatalogRepository, serviceKey: string, dependsOnServiceKey: string): Promise<void> {
  const service = await requireServiceByKey(repo, serviceKey);
  const dependsOn = await requireServiceByKey(repo, dependsOnServiceKey);
  if (service.id === dependsOn.id) {
    throw new ServiceCatalogError(`"${serviceKey}" cannot depend on itself`, "invalid_key");
  }
  await repo.addDependency(service.id, dependsOn.id);
}

export async function removeDependency(repo: ServiceCatalogRepository, serviceKey: string, dependsOnServiceKey: string): Promise<void> {
  const service = await requireServiceByKey(repo, serviceKey);
  const dependsOn = await requireServiceByKey(repo, dependsOnServiceKey);
  await repo.removeDependency(service.id, dependsOn.id);
}

/**
 * The "can Aegis reason about the whole graph" function: walks
 * serviceKey's full transitive dependency closure (cycle-safe, same
 * visited-set approach as resolveDependencyClosure) and classifies
 * each dependency against the org's CURRENT catalog state -- not
 * whether it's theoretically satisfiable, but whether it's satisfied
 * right now, and if not, exactly what would need to happen.
 *
 * Deliberately reuses computeServiceAvailability per dependency rather
 * than a separate check, so this can never disagree with what the
 * Organization View / Tier Progression screens already show for that
 * same service.
 */
export async function resolveDependencyRequirements(
  repo: ServiceCatalogRepository,
  organizationId: string,
  serviceKey: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<DependencyRequirement[]> {
  const service = await requireServiceByKey(repo, serviceKey);

  const visited = new Set<string>([service.id]);
  const queue = await repo.listDirectDependencies(service.id);
  const dependencyServiceIds: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    dependencyServiceIds.push(currentId);
    const nested = await repo.listDirectDependencies(currentId);
    queue.push(...nested);
  }

  const requirements: DependencyRequirement[] = [];
  for (const depId of dependencyServiceIds) {
    const depService = await repo.getServiceById(depId);
    if (!depService || !depService.isActive) continue; // retired/missing dependency -- nothing meaningful to report

    const availability = await computeServiceAvailability(repo, organizationId, depService.key, currentPlanCode, now);

    if (availability.state === "available" || availability.state === "trial") {
      requirements.push({ service: depService, status: "already_satisfied" });
    } else if (availability.state === "disabled") {
      requirements.push({ service: depService, status: "disabled", reason: availability.reason });
    } else if (availability.unlockPath.type === "add_on") {
      requirements.push({ service: depService, status: "can_auto_attach" });
    } else {
      requirements.push({ service: depService, status: "requires_upgrade", requiresPlanCode: availability.unlockPath.targetPlanCode });
    }
  }

  return requirements;
}

// ---------------------------------------------------------------------
// Solution Bundles: curated, typically industry-specific groups of
// services sold as one purchasable unit (Agriculture, Manufacturing,
// Healthcare, ...) -- see 0027_solution_bundles.sql for the full
// reasoning. Deliberately simpler than the per-service tier matrix: one
// minimumPlanCode, one price, no per-tier variation.
// ---------------------------------------------------------------------

async function requireBundleByKey(repo: ServiceCatalogRepository, key: string): Promise<SolutionBundle> {
  const bundle = await repo.getBundleByKey(key);
  if (!bundle) {
    throw new ServiceCatalogError(`No solution bundle with key "${key}"`, "bundle_not_found");
  }
  return bundle;
}

export async function createBundle(
  repo: ServiceCatalogRepository,
  input: {
    key: string;
    name: string;
    description: string;
    category: string;
    minimumPlanCode?: string | null;
    monthlyPriceCents?: number | null;
    stripePriceId?: string | null;
    supportsTrial?: boolean;
  },
): Promise<SolutionBundle> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ServiceCatalogError(
      `Invalid bundle key "${input.key}" -- must be lowercase-with-dashes (e.g. "agriculture-bundle")`,
      "invalid_key",
    );
  }
  const existing = await repo.getBundleByKey(input.key);
  if (existing) {
    throw new ServiceCatalogError(`A bundle with key "${input.key}" already exists`, "duplicate_key");
  }

  const bundle: SolutionBundle = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    category: input.category,
    isActive: true,
    minimumPlanCode: input.minimumPlanCode ?? null,
    monthlyPriceCents: input.monthlyPriceCents ?? null,
    stripePriceId: input.stripePriceId ?? null,
    supportsTrial: input.supportsTrial ?? true,
  };
  await repo.createBundle(bundle);
  return bundle;
}

export async function listBundles(repo: ServiceCatalogRepository, opts?: { activeOnly?: boolean }): Promise<SolutionBundle[]> {
  return repo.listBundles(opts);
}

export async function addServiceToBundle(repo: ServiceCatalogRepository, bundleKey: string, serviceKey: string): Promise<void> {
  const bundle = await requireBundleByKey(repo, bundleKey);
  const service = await requireServiceByKey(repo, serviceKey);
  await repo.addServiceToBundle(bundle.id, service.id);
}

export async function removeServiceFromBundle(repo: ServiceCatalogRepository, bundleKey: string, serviceKey: string): Promise<void> {
  const bundle = await requireBundleByKey(repo, bundleKey);
  const service = await requireServiceByKey(repo, serviceKey);
  await repo.removeServiceFromBundle(bundle.id, service.id);
}

/**
 * Attaches a bundle to an org's plan. Refuses if the org's tier is
 * below the bundle's minimumPlanCode (when set) -- the bundle-level
 * equivalent of resolveEffectiveTierAvailability's eligibility check,
 * just simpler since bundles don't have a per-tier matrix.
 */
export async function attachBundle(
  repo: ServiceCatalogRepository,
  organizationId: string,
  bundleKey: string,
  currentPlanCode: string,
  opts?: { trial?: boolean; trialDurationDays?: number; now?: Date },
): Promise<OrgBundleSelection> {
  const bundle = await requireBundleByKey(repo, bundleKey);

  if (bundle.minimumPlanCode) {
    const orgRank = await getTierRank(repo, currentPlanCode);
    const minRank = await getTierRank(repo, bundle.minimumPlanCode);
    if (orgRank < minRank) {
      throw new ServiceCatalogError(
        `"${bundleKey}" requires the ${bundle.minimumPlanCode} plan or higher -- org is on "${currentPlanCode}"`,
        "plan_not_found",
      );
    }
  }

  if (opts?.trial && !bundle.supportsTrial) {
    throw new ServiceCatalogError(`"${bundleKey}" does not support trial attachment`, "plan_not_found");
  }

  const now = opts?.now ?? new Date();
  const trialDays = opts?.trialDurationDays ?? 14;
  const existing = await repo.getOrgBundleSelection(organizationId, bundle.id);

  const selection: OrgBundleSelection = {
    id: existing?.id ?? randomUUID(),
    organizationId,
    bundleId: bundle.id,
    status: opts?.trial ? "trial" : "active",
    trialExpiresAt: opts?.trial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
    attachedAt: now,
    cancelledAt: null,
  };
  await repo.upsertOrgBundleSelection(selection);
  return selection;
}

export async function cancelBundle(repo: ServiceCatalogRepository, organizationId: string, bundleKey: string, now?: Date): Promise<OrgBundleSelection> {
  const bundle = await requireBundleByKey(repo, bundleKey);
  const existing = await repo.getOrgBundleSelection(organizationId, bundle.id);
  if (!existing) {
    throw new ServiceCatalogError(`Organization ${organizationId} has no selection for "${bundleKey}" to cancel`, "selection_not_found");
  }
  const updated: OrgBundleSelection = { ...existing, status: "cancelled", cancelledAt: now ?? new Date() };
  await repo.upsertOrgBundleSelection(updated);
  return updated;
}

/**
 * Whether `serviceId` is granted to this org via ANY of their active-or-
 * unexpired-trial bundle selections, and if so, whether that grant is
 * itself still-in-trial (so callers can render a "trial" state rather
 * than "available"). Shared by computeServiceAvailability (UI state)
 * and computeDirectlyEntitledServices (final entitlements) so they
 * can't disagree about what a bundle grants -- same reasoning as
 * resolveEffectiveTierAvailability being shared between
 * computeServiceAvailability and attachAddOn.
 */
async function resolveBundleGrant(
  repo: ServiceCatalogRepository,
  organizationId: string,
  serviceId: string,
  now: Date,
): Promise<{ granted: boolean; trial: { expiresAt: Date } | null }> {
  const selections = await repo.listOrgBundleSelections(organizationId);
  for (const selection of selections) {
    if (selection.status === "cancelled") continue;
    if (selection.status === "trial" && (!selection.trialExpiresAt || selection.trialExpiresAt.getTime() <= now.getTime())) {
      continue; // expired trial -- same "never trust the stored status alone" rule as service selections
    }

    const memberServiceIds = await repo.listServicesInBundle(selection.bundleId);
    if (memberServiceIds.includes(serviceId)) {
      return {
        granted: true,
        trial: selection.status === "trial" ? { expiresAt: selection.trialExpiresAt! } : null,
      };
    }
  }
  return { granted: false, trial: null };
}

// ---------------------------------------------------------------------
// Org selections (add-on attach/cancel)
// ---------------------------------------------------------------------

/**
 * Attaches an add-on to an org's plan. Refuses if the service isn't
 * actually "addable" at the org's current tier -- callers should check
 * computeServiceAvailability first and only offer this action when the
 * result is a "locked" state with an "add_on" unlockPath; this is the
 * server-side enforcement of that same rule, not just a UI-level nicety.
 */
export async function attachAddOn(
  repo: ServiceCatalogRepository,
  organizationId: string,
  serviceKey: string,
  currentPlanCode: string,
  opts?: { trial?: boolean; trialDurationDays?: number; now?: Date; autoResolveDependencies?: boolean },
): Promise<OrgServiceSelection> {
  const service = await requireServiceByKey(repo, serviceKey);

  if (!service.isAddOnEligible) {
    throw new ServiceCatalogError(`"${serviceKey}" is not eligible to be attached as an add-on`, "plan_not_found");
  }
  if (opts?.trial && !service.supportsTrial) {
    throw new ServiceCatalogError(`"${serviceKey}" does not support trial attachment`, "plan_not_found");
  }

  const effective = await resolveEffectiveTierAvailability(repo, service, currentPlanCode);

  if (effective.type !== "addable") {
    throw new ServiceCatalogError(
      `"${serviceKey}" is not an addable service at plan "${currentPlanCode}" -- it's ${effective.type} there`,
      "plan_not_found",
    );
  }

  const now = opts?.now ?? new Date();

  // Dependency resolution -- the actual point of elevating dependencies
  // to a first-class concept. Three outcomes, matching exactly what an
  // admin needs to reason about before attaching:
  const requirements = await resolveDependencyRequirements(repo, organizationId, serviceKey, currentPlanCode, now);
  const unsatisfied = requirements.filter((r) => r.status !== "already_satisfied");

  if (unsatisfied.length > 0) {
    const blocking = unsatisfied.filter((r) => r.status === "requires_upgrade" || r.status === "disabled");
    const autoAttachable = unsatisfied.filter((r) => r.status === "can_auto_attach");

    if (blocking.length > 0) {
      // Genuinely can't proceed -- an upgrade or waiting out a
      // maintenance window isn't something this function can resolve
      // on the caller's behalf. "It requires Analytics, which you
      // don't currently have" -- and here's exactly why not.
      throw new ServiceCatalogError(
        `Cannot attach "${serviceKey}" -- blocked by unmet dependencies: ${blocking.map((r) => r.service.name).join(", ")}`,
        "dependency_not_satisfied",
        unsatisfied,
      );
    }

    if (!opts?.autoResolveDependencies) {
      // Everything remaining IS resolvable, but silently attaching
      // (and billing for) additional services without the caller
      // explicitly opting in would be a real surprise -- "adding this
      // will also require these prerequisites" needs to be something
      // the caller confirms, not something that just happens. Callers
      // that already know this and want it handled pass
      // autoResolveDependencies: true.
      throw new ServiceCatalogError(
        `"${serviceKey}" requires these services to also be attached: ${autoAttachable.map((r) => r.service.name).join(", ")}`,
        "dependency_not_satisfied",
        unsatisfied,
      );
    }

    // Recursive, not a flat loop -- each dependency's OWN dependencies
    // get resolved the same way, so a chain (A needs B, B needs C)
    // resolves fully rather than stopping one level deep.
    for (const req of autoAttachable) {
      await attachAddOn(repo, organizationId, req.service.key, currentPlanCode, { autoResolveDependencies: true, now });
    }
  }

  const trialDays = opts?.trialDurationDays ?? 14;
  const existing = await repo.getOrgServiceSelection(organizationId, service.id);

  const selection: OrgServiceSelection = {
    id: existing?.id ?? randomUUID(),
    organizationId,
    serviceId: service.id,
    status: opts?.trial ? "trial" : "active",
    trialExpiresAt: opts?.trial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
    attachedAt: now,
    cancelledAt: null,
  };
  await repo.upsertOrgServiceSelection(selection);
  return selection;
}

export async function cancelAddOn(repo: ServiceCatalogRepository, organizationId: string, serviceKey: string, now?: Date): Promise<OrgServiceSelection> {
  const service = await requireServiceByKey(repo, serviceKey);
  const existing = await repo.getOrgServiceSelection(organizationId, service.id);
  if (!existing) {
    throw new ServiceCatalogError(`Organization ${organizationId} has no selection for "${serviceKey}" to cancel`, "selection_not_found");
  }

  const updated: OrgServiceSelection = { ...existing, status: "cancelled", cancelledAt: now ?? new Date() };
  await repo.upsertOrgServiceSelection(updated);
  return updated;
}

// ---------------------------------------------------------------------
// Disable overrides
// ---------------------------------------------------------------------

export async function disableService(
  repo: ServiceCatalogRepository,
  serviceKey: string,
  input: { organizationId?: string | null; reason: string; cause: DisableCause; estimatedResolution?: Date | null; createdBy?: string | null },
): Promise<ServiceDisableOverride> {
  const service = await requireServiceByKey(repo, serviceKey);
  const override: ServiceDisableOverride = {
    id: randomUUID(),
    serviceId: service.id,
    organizationId: input.organizationId ?? null,
    reason: input.reason,
    cause: input.cause,
    estimatedResolution: input.estimatedResolution ?? null,
    createdAt: new Date(),
    createdBy: input.createdBy ?? null,
    resolvedAt: null,
  };
  await repo.createDisableOverride(override);
  return override;
}

export async function resolveDisableOverride(repo: ServiceCatalogRepository, overrideId: string, now?: Date): Promise<void> {
  await repo.resolveDisableOverride(overrideId, now ?? new Date());
}

// ---------------------------------------------------------------------
// State computation -- the actual point of this module
// ---------------------------------------------------------------------

async function getTierRank(repo: ServiceCatalogRepository, planCode: string): Promise<number> {
  const planCodesAscending = await repo.listPlanCodesByPriceAscending();
  const rank = planCodesAscending.indexOf(planCode);
  if (rank === -1) {
    throw new ServiceCatalogError(`Unknown plan code "${planCode}"`, "plan_not_found");
  }
  return rank;
}

function nearestFromExplicitRows(rows: ServiceTierAvailability[], planCodesAscending: string[]): string | null {
  const byPlan = new Map(rows.map((r) => [r.planCode, r.availabilityType]));
  for (const planCode of planCodesAscending) {
    const type = byPlan.get(planCode);
    if (type === "included" || type === "addable") {
      return planCode;
    }
  }
  return null;
}

type EffectiveTierAvailability =
  | { type: "included" }
  | { type: "addable"; addOnStripePriceId: string | null }
  | { type: "unavailable"; nearestUnlockPlanCode: string | null };

/**
 * The single source of truth for "what does this service's tier
 * placement actually mean at this plan" -- both computeServiceAvailability
 * (read path, what a UI renders) and attachAddOn (write path, the
 * server-side gate on actually purchasing) call this, specifically so
 * they can't disagree with each other. Before this existed as a shared
 * function, attachAddOn only ever checked the explicit matrix directly
 * -- which would have incorrectly rejected an attach attempt for a
 * service that's eligible purely through minimumPlanCode with no
 * explicit row, the exact "no new code" case minimum tier exists for.
 *
 * Deliberately all-or-nothing per service: if ANY explicit
 * service_tier_availability row exists for this service (at ANY plan,
 * not just the one being checked), the explicit matrix is used
 * exclusively and minimumPlanCode is ignored entirely -- never a
 * per-tier blend of "explicit row for Foundation, minimumPlanCode
 * fallback for Professional." That blend is a real ambiguity (which
 * wins if they'd disagree about the nearest-unlock target?) not worth
 * the complexity of resolving when a clean, predictable either/or rule
 * covers the actual use case -- a service either fully uses the matrix
 * (fine-grained per-tier control, including per-tier pricing) or fully
 * uses the shortcut (uniform "requires at least X" with one price).
 */
async function resolveEffectiveTierAvailability(
  repo: ServiceCatalogRepository,
  service: Service,
  planCode: string,
): Promise<EffectiveTierAvailability> {
  const allRows = await repo.listTierAvailabilityForService(service.id);

  if (allRows.length > 0) {
    const row = allRows.find((r) => r.planCode === planCode);
    const planCodesAscending = await repo.listPlanCodesByPriceAscending();

    if (!row || row.availabilityType === "unavailable") {
      return { type: "unavailable", nearestUnlockPlanCode: nearestFromExplicitRows(allRows, planCodesAscending) };
    }
    if (row.availabilityType === "included") {
      return { type: "included" };
    }
    return { type: "addable", addOnStripePriceId: row.addOnStripePriceId };
  }

  if (service.minimumPlanCode) {
    const orgRank = await getTierRank(repo, planCode);
    const minRank = await getTierRank(repo, service.minimumPlanCode);
    if (orgRank >= minRank) {
      return { type: "addable", addOnStripePriceId: service.defaultAddOnStripePriceId };
    }
    return { type: "unavailable", nearestUnlockPlanCode: service.minimumPlanCode };
  }

  // No explicit rows, no minimum tier -- an incompletely-configured
  // catalog entry. Fully unavailable, no known unlock path; that's a
  // catalog-authoring gap worth surfacing upstream, not this
  // function's job to guess at.
  return { type: "unavailable", nearestUnlockPlanCode: null };
}

/**
 * Computes the four-state availability for one service, for one org, at
 * their current plan. Precedence, in order:
 *
 *   1. Disable overrides (org-specific, then global) -- unconditional.
 *      Operational state always wins over subscription state; a
 *      service under maintenance is unavailable regardless of what tier
 *      grants it.
 *   2. Tier matrix lookup for (service, currentPlanCode):
 *      - "included" -> available.
 *      - "addable" -> check the org's own selection:
 *          - active selection -> available.
 *          - trial selection, not yet expired -> trial (with
 *            daysRemaining computed from `now`, not stored -- see
 *            OrgServiceSelection's own doc comment on why
 *            trialExpiresAt is the only stored source of truth).
 *          - trial selection, expired -> treated as locked, same as no
 *            selection at all. Deliberately re-checked here rather than
 *            trusted from stored status, so an expired trial shows
 *            correctly even if no cleanup job has flipped its status row
 *            yet -- this function never assumes background maintenance
 *            already ran.
 *          - no selection, or cancelled -> locked, add_on unlock path.
 *      - "unavailable", or no matrix row at all (a service not yet
 *        priced into a tier defaults to unavailable there) -> locked,
 *        upgrade_tier unlock path, pointing at the cheapest plan where
 *        it becomes included or addable.
 */
function trialAvailability(expiresAt: Date, now: Date): ServiceAvailability {
  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  return { state: "trial", expiresAt, daysRemaining };
}

export async function computeServiceAvailability(
  repo: ServiceCatalogRepository,
  organizationId: string,
  serviceKey: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<ServiceAvailability> {
  const service = await requireServiceByKey(repo, serviceKey);

  const activeOverrides = await repo.listActiveDisableOverrides(service.id, organizationId);
  if (activeOverrides.length > 0) {
    // Prefer an org-specific override over a global one when both
    // somehow apply -- it's the more specific, more likely
    // deliberately-targeted reason.
    const override = activeOverrides.find((o) => o.organizationId === organizationId) ?? activeOverrides[0]!;
    return {
      state: "disabled",
      reason: override.reason,
      cause: override.cause,
      estimatedResolution: override.estimatedResolution,
    };
  }

  // Bundle membership grants access outright, the same way "included"
  // does -- a customer who bought the Agriculture Bundle should see
  // Weather Integrations as available, not locked, regardless of what
  // the tier matrix or minimumPlanCode would otherwise say. This is
  // deliberately different from how dependencies are handled: a
  // dependency is invisible backend plumbing the customer never chose,
  // so it only affects computeFinalEntitlements; a bundle is something
  // they knowingly purchased, so it affects this UI-facing function too.
  const bundleGrant = await resolveBundleGrant(repo, organizationId, service.id, now);
  if (bundleGrant.granted) {
    if (bundleGrant.trial) {
      return trialAvailability(bundleGrant.trial.expiresAt, now);
    }
    return { state: "available", source: "bundle" };
  }

  const effective = await resolveEffectiveTierAvailability(repo, service, currentPlanCode);

  if (effective.type === "included") {
    return { state: "available", source: "tier_included" };
  }

  if (effective.type === "addable") {
    const selection = await repo.getOrgServiceSelection(organizationId, service.id);

    if (selection?.status === "active") {
      return { state: "available", source: "add_on" };
    }

    if (selection?.status === "trial" && selection.trialExpiresAt && selection.trialExpiresAt.getTime() > now.getTime()) {
      return trialAvailability(selection.trialExpiresAt, now);
    }

    return {
      state: "locked",
      reason: `${service.name} is available as an add-on to your current plan`,
      unlockPath: { type: "add_on", serviceId: service.id, addOnStripePriceId: effective.addOnStripePriceId },
    };
  }

  // "unavailable" -- not offered at this tier at all (whether by
  // explicit matrix row or because the org's plan is below
  // minimumPlanCode -- resolveEffectiveTierAvailability's
  // nearestUnlockPlanCode already accounts for both).
  const targetPlanCode = effective.nearestUnlockPlanCode;
  return {
    state: "locked",
    reason: targetPlanCode
      ? `${service.name} requires the ${targetPlanCode} plan or higher`
      : `${service.name} is not currently available on any plan`,
    unlockPath: { type: "upgrade_tier", targetPlanCode: targetPlanCode ?? currentPlanCode },
  };
}

/** Convenience for rendering a full catalog view: every active service's availability for one org, in one call. */
export async function computeCatalogForOrganization(
  repo: ServiceCatalogRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<Array<{ service: Service; availability: ServiceAvailability }>> {
  const services = await repo.listServices({ activeOnly: true });
  const results: Array<{ service: Service; availability: ServiceAvailability }> = [];
  for (const service of services) {
    const availability = await computeServiceAvailability(repo, organizationId, service.key, currentPlanCode, now);
    results.push({ service, availability });
  }
  return results;
}

export interface CategorizedCatalogGroup {
  /** Null represents the "Uncategorized" fallback bucket -- see this function's own doc comment. */
  category: Category | null;
  entries: Array<{ service: Service; availability: ServiceAvailability }>;
}

/**
 * The same per-org catalog as computeCatalogForOrganization, grouped by
 * category instead of by availability state -- the browsing view for a
 * catalog that's grown past a flat list (hundreds of services need
 * structure; a five-section available/trial/locked/addon/disabled dump
 * doesn't provide it the way "AI: Chat, Agents, Voice, Vision" does).
 *
 * Ordered by Category.displayOrder ascending -- a deliberate curated
 * order, not alphabetical. Any service whose category string doesn't
 * match a real category key (Service.category is still free text; see
 * 0032_service_categories.sql for why) falls into a single
 * "Uncategorized" group (category: null) appended last, rather than
 * being silently dropped from the view or causing an error. A category
 * with zero matching services is simply omitted -- there's nothing
 * useful to render for it, and an admin can already see the full
 * category list separately via listCategories.
 */
export async function computeCategorizedCatalogForOrganization(
  repo: ServiceCatalogRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<CategorizedCatalogGroup[]> {
  const flat = await computeCatalogForOrganization(repo, organizationId, currentPlanCode, now);
  const categories = await repo.listCategories({ activeOnly: true });
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));

  const groupedByCategoryKey = new Map<string, CategorizedCatalogGroup["entries"]>();
  const uncategorized: CategorizedCatalogGroup["entries"] = [];

  for (const entry of flat) {
    const category = categoryByKey.get(entry.service.category);
    if (!category) {
      uncategorized.push(entry);
      continue;
    }
    if (!groupedByCategoryKey.has(category.key)) {
      groupedByCategoryKey.set(category.key, []);
    }
    groupedByCategoryKey.get(category.key)!.push(entry);
  }

  const groups: CategorizedCatalogGroup[] = categories
    .filter((c) => groupedByCategoryKey.has(c.key))
    .map((category) => ({ category, entries: groupedByCategoryKey.get(category.key)! }));

  if (uncategorized.length > 0) {
    groups.push({ category: null, entries: uncategorized });
  }

  return groups;
}

export interface NavigationItem {
  key: string;
  label: string;
  path: string;
  icon: string | null;
  color: string | null;
  /** Pass-through metadata for Aegis's own customer-facing permission model -- see Category.requiredPermission's own doc comment for why this backend never evaluates it. */
  requiredPermission: string | null;
  /**
   * A rollup across every service in this category, for this org --
   * "give me my catalog" and the frontend builds nav entries that are
   * dimmed, bright, or trial-badged without hardcoding any of it.
   * Precedence: any service in trial outranks merely having something
   * available (a trial countdown is the more actionable thing to
   * surface), which outranks everything being locked or the category
   * having no services in it at all.
   */
  state: "enabled" | "locked" | "trial";
}

/**
 * "Give me my catalog," specifically for navigation: only categories
 * with a navigationPath set (most categories won't have one -- see
 * Category.navigationPath's own doc comment) become nav items, ordered
 * by displayOrder same as everywhere else in the catalog. Reuses
 * computeCategorizedCatalogForOrganization directly rather than
 * recomputing per-service availability separately, so this can never
 * disagree with what the categorized catalog view already shows for
 * the same org.
 *
 * Deliberately excludes the "Uncategorized" bucket -- it has no
 * navigationPath by construction (category: null), so it's not
 * eligible to become a nav item regardless.
 *
 * One real consequence of reusing computeCategorizedCatalogForOrganization
 * rather than iterating categories directly: a category with zero
 * matching services is omitted here too, same as the categorized
 * catalog view (see that function's own doc comment). A nav-configured
 * category with no services in it yet won't appear in the nav at all,
 * not as a "locked, nothing here" entry -- if a placeholder "coming
 * soon" nav item is ever wanted, that's a deliberate design choice to
 * revisit here specifically, not an oversight.
 */
export async function computeNavigationForOrganization(
  repo: ServiceCatalogRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<NavigationItem[]> {
  const groups = await computeCategorizedCatalogForOrganization(repo, organizationId, currentPlanCode, now);

  const items: NavigationItem[] = [];
  for (const group of groups) {
    if (!group.category || !group.category.navigationPath) continue;

    const hasTrial = group.entries.some((e) => e.availability.state === "trial");
    const hasAvailable = group.entries.some((e) => e.availability.state === "available");
    const state: NavigationItem["state"] = hasTrial ? "trial" : hasAvailable ? "enabled" : "locked";

    items.push({
      key: group.category.key,
      label: group.category.name,
      path: group.category.navigationPath,
      icon: group.category.icon,
      color: group.category.color,
      requiredPermission: group.category.requiredPermission,
      state,
    });
  }

  return items;
}

// ---------------------------------------------------------------------
// Final entitlements pipeline: tier -> included -> add-ons -> bundles
// -> dependencies -> feature flags -> final entitlements. The thing
// that lets other systems (Subscriptions, the Entitlement Engine) stop
// knowing anything about individual services and just ask the catalog.
// ---------------------------------------------------------------------

/**
 * Services the org is DIRECTLY entitled to -- tier-included, an
 * addable service with an active (or unexpired-trial) selection, or a
 * member of a bundle the org has an active (or unexpired-trial)
 * selection for. Respects disable overrides: a service under an active
 * override contributes no entitlement here, same precedence as
 * computeServiceAvailability -- operational state always wins over
 * subscription state. Deliberately does NOT walk dependencies; that's
 * the next stage (resolveDependencyClosure), kept separate so this
 * function's job stays "what did the org actually pay for, get
 * included, or get via a bundle," not "what's the full transitive set."
 */
async function computeDirectlyEntitledServices(
  repo: ServiceCatalogRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date,
): Promise<Service[]> {
  const services = await repo.listServices({ activeOnly: true });
  const directlyEntitled: Service[] = [];

  for (const service of services) {
    const activeOverrides = await repo.listActiveDisableOverrides(service.id, organizationId);
    if (activeOverrides.length > 0) {
      continue; // disabled -- no entitlement, regardless of tier/selection/bundle
    }

    const bundleGrant = await resolveBundleGrant(repo, organizationId, service.id, now);
    if (bundleGrant.granted) {
      directlyEntitled.push(service);
      continue;
    }

    const effective = await resolveEffectiveTierAvailability(repo, service, currentPlanCode);

    if (effective.type === "included") {
      directlyEntitled.push(service);
      continue;
    }

    if (effective.type === "addable") {
      const selection = await repo.getOrgServiceSelection(organizationId, service.id);
      const activeSelection = selection?.status === "active";
      const validTrial =
        selection?.status === "trial" && selection.trialExpiresAt !== null && selection.trialExpiresAt.getTime() > now.getTime();
      if (activeSelection || validTrial) {
        directlyEntitled.push(service);
      }
    }
  }

  return directlyEntitled;
}

/**
 * Expands a directly-entitled set to include everything they
 * transitively depend on. BFS with a visited set -- a dependency cycle
 * (accidental, or even deliberately created via addDependency, which
 * doesn't itself forbid one) can't cause an infinite loop here.
 *
 * A dependency is granted once its dependent is entitled, regardless of
 * whether the org would otherwise be independently eligible to
 * purchase it standalone -- same as a package manager: needing package
 * A which requires package B gets you B too, no separate "are you
 * allowed B" check. Deliberately does NOT apply disable-override
 * filtering to the dependencies themselves (only computeDirectlyEntitledServices
 * does that, for the directly-entitled set) -- a maintenance window on
 * a foundational dependency cascading through every service that
 * depends on it is a bigger, separate operational question this
 * function doesn't try to solve.
 */
async function resolveDependencyClosure(repo: ServiceCatalogRepository, directlyEntitled: Service[]): Promise<Map<string, Service>> {
  const byId = new Map<string, Service>();
  for (const service of directlyEntitled) {
    byId.set(service.id, service);
  }

  const visited = new Set<string>(directlyEntitled.map((s) => s.id));
  const queue = [...visited];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const dependsOnIds = await repo.listDirectDependencies(currentId);
    for (const depId of dependsOnIds) {
      if (visited.has(depId)) continue;
      visited.add(depId);
      const depService = await repo.getServiceById(depId);
      if (depService && depService.isActive) {
        byId.set(depId, depService);
        queue.push(depId);
      }
    }
  }

  return byId;
}

/**
 * The full pipeline: tier -> included services -> purchased add-ons ->
 * dependencies -> feature flags -> final entitlements. Returns the flat
 * set of entitlementKey strings a backend `hasEntitlement(org, key)`-
 * style check should look for.
 *
 * Services with no entitlementKey contribute nothing to the result --
 * they're catalog/display-only, or exist purely to satisfy another
 * service's dependency without granting anything on their own.
 *
 * featureFlagKey is the last gate: even a fully tier/add-on/dependency
 * entitled service is excluded if it has an associated feature flag
 * that evaluates false for this org -- e.g. gating a newly-included
 * service behind a gradual rollout, independent of subscription state
 * entirely. See VOCABULARY.md-adjacent reasoning in Feature Flags'
 * isFeatureEnabled for why it fails closed on an unknown/unconfigured
 * flag key -- a typo'd featureFlagKey here means the service is
 * silently suppressed for everyone, not silently granted to everyone,
 * which is the safer failure direction for something gating real access.
 */
export async function computeFinalEntitlements(
  catalogRepo: ServiceCatalogRepository,
  featureFlagsRepo: FeatureFlagsRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<Set<string>> {
  const directlyEntitled = await computeDirectlyEntitledServices(catalogRepo, organizationId, currentPlanCode, now);
  const fullyEntitledServices = await resolveDependencyClosure(catalogRepo, directlyEntitled);

  const entitlements = new Set<string>();
  for (const service of fullyEntitledServices.values()) {
    if (!service.entitlementKey) {
      continue;
    }

    if (service.featureFlagKey) {
      const flagOn = await isFeatureEnabled(featureFlagsRepo, service.featureFlagKey, organizationId);
      if (!flagOn) {
        continue;
      }
    }

    entitlements.add(service.entitlementKey);
  }

  return entitlements;
}

// ---------------------------------------------------------------------
// Tier progression: "what would upgrading unlock, grouped by tier" --
// the customer-facing upsell roadmap, not just a flat locked-services list.
// ---------------------------------------------------------------------

export interface TierProgressionEntry {
  planCode: string;
  unlocksServices: Service[];
}

/**
 * Groups the org's currently-locked services by the tier that would
 * unlock each one, ascending (the next tier up first). Deliberately
 * reuses computeServiceAvailability entirely rather than recomputing
 * "which tier unlocks this" independently -- a service only appears
 * here if its current state is specifically `locked` with an
 * `upgrade_tier` unlockPath, using that exact targetPlanCode as the
 * grouping key. This means:
 *
 *   - Already-available or in-trial services never appear (nothing to
 *     unlock).
 *   - Disabled services never appear -- computeServiceAvailability
 *     returns "disabled" for those, not "locked", so there's nothing
 *     to tease upgrading for something that isn't actually working
 *     right now.
 *   - Services that are locked via an "add_on" path (purchasable NOW,
 *     no tier change needed) never appear here -- showing them under
 *     "unlocks at Business" would be actively misleading, since the
 *     org can already buy them at their current tier.
 *   - A service appears under exactly one tier -- the first (cheapest)
 *     one that unlocks it, matching resolveEffectiveTierAvailability's
 *     own "nearest unlocking plan" search. It does not additionally
 *     appear under every higher tier too.
 *
 * Bundles are deliberately out of scope for this function -- it
 * answers "what individual services would upgrading unlock," not "what
 * bundles would become purchasable." A bundle-aware version of this
 * view is a reasonable future extension, not bundled into this pass.
 */
export async function computeTierProgression(
  repo: ServiceCatalogRepository,
  organizationId: string,
  currentPlanCode: string,
  now: Date = new Date(),
): Promise<TierProgressionEntry[]> {
  const planCodesAscending = await repo.listPlanCodesByPriceAscending();
  const currentRank = planCodesAscending.indexOf(currentPlanCode);
  if (currentRank === -1) {
    throw new ServiceCatalogError(`Unknown plan code "${currentPlanCode}"`, "plan_not_found");
  }

  const services = await repo.listServices({ activeOnly: true });
  const byPlanCode = new Map<string, Service[]>();

  for (const service of services) {
    const availability = await computeServiceAvailability(repo, organizationId, service.key, currentPlanCode, now);
    if (availability.state !== "locked" || availability.unlockPath.type !== "upgrade_tier") {
      continue;
    }

    const targetPlanCode = availability.unlockPath.targetPlanCode;
    const targetRank = planCodesAscending.indexOf(targetPlanCode);
    if (targetRank <= currentRank) {
      // Shouldn't happen given upgrade_tier semantics (the target is
      // always supposed to be strictly above the org's current tier),
      // but guarded rather than trusted blindly -- a degenerate
      // "unlock at my current or a lower tier" entry would be nonsense
      // to show on a progression roadmap.
      continue;
    }

    if (!byPlanCode.has(targetPlanCode)) {
      byPlanCode.set(targetPlanCode, []);
    }
    byPlanCode.get(targetPlanCode)!.push(service);
  }

  return planCodesAscending.filter((planCode) => byPlanCode.has(planCode)).map((planCode) => ({ planCode, unlocksServices: byPlanCode.get(planCode)! }));
}
