import type { ServiceCatalogRepository } from "../src/repository.js";
import type { Category, OrgBundleSelection, OrgServiceSelection, Service, ServiceDisableOverride, ServiceTierAvailability, SolutionBundle } from "../src/types.js";

export class FakeServiceCatalogRepository implements ServiceCatalogRepository {
  categories = new Map<string, Category>(); // keyed by id
  services = new Map<string, Service>(); // keyed by id
  tierAvailability = new Map<string, ServiceTierAvailability>(); // keyed by `${serviceId}:${planCode}`
  selections = new Map<string, OrgServiceSelection>(); // keyed by `${organizationId}:${serviceId}`
  disableOverrides = new Map<string, ServiceDisableOverride>(); // keyed by id
  dependencies = new Set<string>(); // keyed by `${serviceId}:${dependsOnServiceId}`
  bundles = new Map<string, SolutionBundle>(); // keyed by id
  bundleServices = new Set<string>(); // keyed by `${bundleId}:${serviceId}`
  bundleSelections = new Map<string, OrgBundleSelection>(); // keyed by `${organizationId}:${bundleId}`
  planCodesByPriceAscending: string[] = [];

  async createService(service: Service) {
    this.services.set(service.id, service);
  }
  async getServiceById(id: string) {
    return this.services.get(id) ?? null;
  }
  async getServiceByKey(key: string) {
    return [...this.services.values()].find((s) => s.key === key) ?? null;
  }
  async listServices(opts?: { activeOnly?: boolean }) {
    const all = [...this.services.values()];
    return opts?.activeOnly ? all.filter((s) => s.isActive) : all;
  }
  async updateService(service: Service) {
    this.services.set(service.id, service);
  }

  async setTierAvailability(entry: ServiceTierAvailability) {
    this.tierAvailability.set(`${entry.serviceId}:${entry.planCode}`, entry);
  }
  async getTierAvailability(serviceId: string, planCode: string) {
    return this.tierAvailability.get(`${serviceId}:${planCode}`) ?? null;
  }
  async listTierAvailabilityForService(serviceId: string) {
    return [...this.tierAvailability.values()].filter((a) => a.serviceId === serviceId);
  }
  async listAllTierAvailability() {
    return [...this.tierAvailability.values()];
  }

  async upsertOrgServiceSelection(selection: OrgServiceSelection) {
    this.selections.set(`${selection.organizationId}:${selection.serviceId}`, selection);
  }
  async getOrgServiceSelection(organizationId: string, serviceId: string) {
    return this.selections.get(`${organizationId}:${serviceId}`) ?? null;
  }
  async listOrgServiceSelections(organizationId: string) {
    return [...this.selections.values()].filter((s) => s.organizationId === organizationId);
  }

  async createDisableOverride(override: ServiceDisableOverride) {
    this.disableOverrides.set(override.id, override);
  }
  async resolveDisableOverride(id: string, resolvedAt: Date) {
    const existing = this.disableOverrides.get(id);
    if (existing) this.disableOverrides.set(id, { ...existing, resolvedAt });
  }
  async listActiveDisableOverrides(serviceId: string, organizationId: string) {
    return [...this.disableOverrides.values()].filter(
      (o) => o.serviceId === serviceId && o.resolvedAt === null && (o.organizationId === null || o.organizationId === organizationId),
    );
  }

  async listPlanCodesByPriceAscending() {
    return this.planCodesByPriceAscending;
  }

  async addDependency(serviceId: string, dependsOnServiceId: string) {
    this.dependencies.add(`${serviceId}:${dependsOnServiceId}`);
  }
  async removeDependency(serviceId: string, dependsOnServiceId: string) {
    this.dependencies.delete(`${serviceId}:${dependsOnServiceId}`);
  }
  async listDirectDependencies(serviceId: string) {
    const prefix = `${serviceId}:`;
    return [...this.dependencies].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  async createBundle(bundle: SolutionBundle) {
    this.bundles.set(bundle.id, bundle);
  }
  async getBundleById(id: string) {
    return this.bundles.get(id) ?? null;
  }
  async getBundleByKey(key: string) {
    return [...this.bundles.values()].find((b) => b.key === key) ?? null;
  }
  async listBundles(opts?: { activeOnly?: boolean }) {
    const all = [...this.bundles.values()];
    return opts?.activeOnly ? all.filter((b) => b.isActive) : all;
  }

  async addServiceToBundle(bundleId: string, serviceId: string) {
    this.bundleServices.add(`${bundleId}:${serviceId}`);
  }
  async removeServiceFromBundle(bundleId: string, serviceId: string) {
    this.bundleServices.delete(`${bundleId}:${serviceId}`);
  }
  async listServicesInBundle(bundleId: string) {
    const prefix = `${bundleId}:`;
    return [...this.bundleServices].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  async upsertOrgBundleSelection(selection: OrgBundleSelection) {
    this.bundleSelections.set(`${selection.organizationId}:${selection.bundleId}`, selection);
  }
  async getOrgBundleSelection(organizationId: string, bundleId: string) {
    return this.bundleSelections.get(`${organizationId}:${bundleId}`) ?? null;
  }
  async listOrgBundleSelections(organizationId: string) {
    return [...this.bundleSelections.values()].filter((s) => s.organizationId === organizationId);
  }

  async createCategory(category: Category) {
    this.categories.set(category.id, category);
  }
  async getCategoryByKey(key: string) {
    return [...this.categories.values()].find((c) => c.key === key) ?? null;
  }
  async listCategories(opts?: { activeOnly?: boolean }) {
    const all = [...this.categories.values()].sort((a, b) => a.displayOrder - b.displayOrder);
    return opts?.activeOnly ? all.filter((c) => c.isActive) : all;
  }
}
