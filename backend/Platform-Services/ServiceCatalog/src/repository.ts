import type { Category, OrgBundleSelection, OrgServiceSelection, Service, ServiceDisableOverride, ServiceTierAvailability, SolutionBundle } from "./types.js";

export interface ServiceCatalogRepository {
  createCategory(category: Category): Promise<void>;
  getCategoryByKey(key: string): Promise<Category | null>;
  listCategories(opts?: { activeOnly?: boolean }): Promise<Category[]>; // ordered by displayOrder ascending

  createService(service: Service): Promise<void>;
  getServiceById(id: string): Promise<Service | null>;
  getServiceByKey(key: string): Promise<Service | null>;
  listServices(opts?: { activeOnly?: boolean }): Promise<Service[]>;
  updateService(service: Service): Promise<void>;

  setTierAvailability(entry: ServiceTierAvailability): Promise<void>;
  getTierAvailability(serviceId: string, planCode: string): Promise<ServiceTierAvailability | null>;
  listTierAvailabilityForService(serviceId: string): Promise<ServiceTierAvailability[]>;
  /** Every (service, plan) row across the whole matrix -- used to find the nearest plan where a currently-unavailable service becomes included or addable. */
  listAllTierAvailability(): Promise<ServiceTierAvailability[]>;

  upsertOrgServiceSelection(selection: OrgServiceSelection): Promise<void>;
  getOrgServiceSelection(organizationId: string, serviceId: string): Promise<OrgServiceSelection | null>;
  listOrgServiceSelections(organizationId: string): Promise<OrgServiceSelection[]>;

  createDisableOverride(override: ServiceDisableOverride): Promise<void>;
  resolveDisableOverride(id: string, resolvedAt: Date): Promise<void>;
  /** Active (resolvedAt IS NULL) overrides matching this service, both global (organizationId NULL) and scoped to this specific org. */
  listActiveDisableOverrides(serviceId: string, organizationId: string): Promise<ServiceDisableOverride[]>;

  /** The ordered list of plan codes a "nearest tier that offers this" search should walk, cheapest/lowest first. Backed by subscription_plans, not this module's own tables -- see the real Postgres implementation. */
  listPlanCodesByPriceAscending(): Promise<string[]>;

  addDependency(serviceId: string, dependsOnServiceId: string): Promise<void>;
  removeDependency(serviceId: string, dependsOnServiceId: string): Promise<void>;
  /** Direct (non-transitive) dependency service IDs for one service. computeFinalEntitlements walks this repeatedly to resolve the full transitive closure. */
  listDirectDependencies(serviceId: string): Promise<string[]>;

  createBundle(bundle: SolutionBundle): Promise<void>;
  getBundleById(id: string): Promise<SolutionBundle | null>;
  getBundleByKey(key: string): Promise<SolutionBundle | null>;
  listBundles(opts?: { activeOnly?: boolean }): Promise<SolutionBundle[]>;

  addServiceToBundle(bundleId: string, serviceId: string): Promise<void>;
  removeServiceFromBundle(bundleId: string, serviceId: string): Promise<void>;
  listServicesInBundle(bundleId: string): Promise<string[]>;

  upsertOrgBundleSelection(selection: OrgBundleSelection): Promise<void>;
  getOrgBundleSelection(organizationId: string, bundleId: string): Promise<OrgBundleSelection | null>;
  listOrgBundleSelections(organizationId: string): Promise<OrgBundleSelection[]>;
}
