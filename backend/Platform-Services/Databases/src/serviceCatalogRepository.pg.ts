/**
 * Postgres implementation of Platform-Services/ServiceCatalog's
 * ServiceCatalogRepository port. Same offline caveat as every other
 * *.pg.ts file in this folder: type-checked against pg's documented
 * API, not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { ServiceCatalogRepository } from "../../ServiceCatalog/src/repository.js";
import type {
  Category,
  OrgBundleSelection,
  OrgServiceSelection,
  Service,
  ServiceDisableOverride,
  ServiceTierAvailability,
  SolutionBundle,
} from "../../ServiceCatalog/src/types.js";

export class PgServiceCatalogRepository implements ServiceCatalogRepository {
  constructor(private readonly pool: Pool) {}

  async createCategory(category: Category): Promise<void> {
    await this.pool.query(
      `INSERT INTO categories (id, key, name, display_order, is_active, navigation_path, icon, color, required_permission)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        category.id,
        category.key,
        category.name,
        category.displayOrder,
        category.isActive,
        category.navigationPath,
        category.icon,
        category.color,
        category.requiredPermission,
      ],
    );
  }

  async getCategoryByKey(key: string): Promise<Category | null> {
    const { rows } = await this.pool.query(`SELECT * FROM categories WHERE key = $1`, [key]);
    return rows[0] ? mapCategory(rows[0]) : null;
  }

  async listCategories(opts?: { activeOnly?: boolean }): Promise<Category[]> {
    const where = opts?.activeOnly ? "WHERE is_active = true" : "";
    const { rows } = await this.pool.query(`SELECT * FROM categories ${where} ORDER BY display_order ASC`);
    return rows.map(mapCategory);
  }

  async createService(service: Service): Promise<void> {
    await this.pool.query(
      `INSERT INTO services
         (id, key, name, description, category, is_active, minimum_plan_code, default_add_on_stripe_price_id,
          is_add_on_eligible, supports_trial, monthly_price_cents, usage_meter_key, entitlement_key, feature_flag_key,
          navigation_path, icon, color, required_permission)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        service.id,
        service.key,
        service.name,
        service.description,
        service.category,
        service.isActive,
        service.minimumPlanCode,
        service.defaultAddOnStripePriceId,
        service.isAddOnEligible,
        service.supportsTrial,
        service.monthlyPriceCents,
        service.usageMeterKey,
        service.entitlementKey,
        service.featureFlagKey,
        service.navigationPath,
        service.icon,
        service.color,
        service.requiredPermission,
      ],
    );
  }

  async getServiceById(id: string): Promise<Service | null> {
    const { rows } = await this.pool.query(`SELECT * FROM services WHERE id = $1`, [id]);
    return rows[0] ? mapService(rows[0]) : null;
  }

  async getServiceByKey(key: string): Promise<Service | null> {
    const { rows } = await this.pool.query(`SELECT * FROM services WHERE key = $1`, [key]);
    return rows[0] ? mapService(rows[0]) : null;
  }

  async listServices(opts?: { activeOnly?: boolean }): Promise<Service[]> {
    const where = opts?.activeOnly ? "WHERE is_active = true" : "";
    const { rows } = await this.pool.query(`SELECT * FROM services ${where} ORDER BY category, name`);
    return rows.map(mapService);
  }

  async updateService(service: Service): Promise<void> {
    await this.pool.query(
      `UPDATE services SET name = $2, description = $3, category = $4, is_active = $5,
         minimum_plan_code = $6, default_add_on_stripe_price_id = $7,
         is_add_on_eligible = $8, supports_trial = $9, monthly_price_cents = $10,
         usage_meter_key = $11, entitlement_key = $12, feature_flag_key = $13,
         navigation_path = $14, icon = $15, color = $16, required_permission = $17, updated_at = now()
       WHERE id = $1`,
      [
        service.id,
        service.name,
        service.description,
        service.category,
        service.isActive,
        service.minimumPlanCode,
        service.defaultAddOnStripePriceId,
        service.isAddOnEligible,
        service.supportsTrial,
        service.monthlyPriceCents,
        service.usageMeterKey,
        service.entitlementKey,
        service.featureFlagKey,
        service.navigationPath,
        service.icon,
        service.color,
        service.requiredPermission,
      ],
    );
  }

  async setTierAvailability(entry: ServiceTierAvailability): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_tier_availability (id, service_id, plan_code, availability_type, add_on_stripe_price_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (service_id, plan_code) DO UPDATE SET
         availability_type = EXCLUDED.availability_type,
         add_on_stripe_price_id = EXCLUDED.add_on_stripe_price_id,
         updated_at = now()`,
      [entry.id, entry.serviceId, entry.planCode, entry.availabilityType, entry.addOnStripePriceId],
    );
  }

  async getTierAvailability(serviceId: string, planCode: string): Promise<ServiceTierAvailability | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM service_tier_availability WHERE service_id = $1 AND plan_code = $2`,
      [serviceId, planCode],
    );
    return rows[0] ? mapTierAvailability(rows[0]) : null;
  }

  async listTierAvailabilityForService(serviceId: string): Promise<ServiceTierAvailability[]> {
    const { rows } = await this.pool.query(`SELECT * FROM service_tier_availability WHERE service_id = $1`, [serviceId]);
    return rows.map(mapTierAvailability);
  }

  async listAllTierAvailability(): Promise<ServiceTierAvailability[]> {
    const { rows } = await this.pool.query(`SELECT * FROM service_tier_availability`);
    return rows.map(mapTierAvailability);
  }

  async upsertOrgServiceSelection(selection: OrgServiceSelection): Promise<void> {
    await this.pool.query(
      `INSERT INTO org_service_selections (id, organization_id, service_id, status, trial_expires_at, attached_at, cancelled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, service_id) DO UPDATE SET
         status = EXCLUDED.status,
         trial_expires_at = EXCLUDED.trial_expires_at,
         attached_at = EXCLUDED.attached_at,
         cancelled_at = EXCLUDED.cancelled_at`,
      [
        selection.id,
        selection.organizationId,
        selection.serviceId,
        selection.status,
        selection.trialExpiresAt,
        selection.attachedAt,
        selection.cancelledAt,
      ],
    );
  }

  async getOrgServiceSelection(organizationId: string, serviceId: string): Promise<OrgServiceSelection | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM org_service_selections WHERE organization_id = $1 AND service_id = $2`,
      [organizationId, serviceId],
    );
    return rows[0] ? mapSelection(rows[0]) : null;
  }

  async listOrgServiceSelections(organizationId: string): Promise<OrgServiceSelection[]> {
    const { rows } = await this.pool.query(`SELECT * FROM org_service_selections WHERE organization_id = $1`, [organizationId]);
    return rows.map(mapSelection);
  }

  async createDisableOverride(override: ServiceDisableOverride): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_disable_overrides
         (id, service_id, organization_id, reason, cause, estimated_resolution, created_at, created_by, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        override.id,
        override.serviceId,
        override.organizationId,
        override.reason,
        override.cause,
        override.estimatedResolution,
        override.createdAt,
        override.createdBy,
        override.resolvedAt,
      ],
    );
  }

  async resolveDisableOverride(id: string, resolvedAt: Date): Promise<void> {
    await this.pool.query(`UPDATE service_disable_overrides SET resolved_at = $2 WHERE id = $1`, [id, resolvedAt]);
  }

  async listActiveDisableOverrides(serviceId: string, organizationId: string): Promise<ServiceDisableOverride[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM service_disable_overrides
        WHERE service_id = $1
          AND resolved_at IS NULL
          AND (organization_id IS NULL OR organization_id = $2)`,
      [serviceId, organizationId],
    );
    return rows.map(mapDisableOverride);
  }

  async listPlanCodesByPriceAscending(): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT code FROM subscription_plans WHERE is_active = true ORDER BY base_price_cents ASC`,
    );
    return rows.map((r) => r.code);
  }

  async addDependency(serviceId: string, dependsOnServiceId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_dependencies (service_id, depends_on_service_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [serviceId, dependsOnServiceId],
    );
  }

  async removeDependency(serviceId: string, dependsOnServiceId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM service_dependencies WHERE service_id = $1 AND depends_on_service_id = $2`,
      [serviceId, dependsOnServiceId],
    );
  }

  async listDirectDependencies(serviceId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT depends_on_service_id FROM service_dependencies WHERE service_id = $1`,
      [serviceId],
    );
    return rows.map((r) => r.depends_on_service_id);
  }

  async createBundle(bundle: SolutionBundle): Promise<void> {
    await this.pool.query(
      `INSERT INTO solution_bundles
         (id, key, name, description, category, is_active, minimum_plan_code, monthly_price_cents, stripe_price_id, supports_trial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        bundle.id,
        bundle.key,
        bundle.name,
        bundle.description,
        bundle.category,
        bundle.isActive,
        bundle.minimumPlanCode,
        bundle.monthlyPriceCents,
        bundle.stripePriceId,
        bundle.supportsTrial,
      ],
    );
  }

  async getBundleById(id: string): Promise<SolutionBundle | null> {
    const { rows } = await this.pool.query(`SELECT * FROM solution_bundles WHERE id = $1`, [id]);
    return rows[0] ? mapBundle(rows[0]) : null;
  }

  async getBundleByKey(key: string): Promise<SolutionBundle | null> {
    const { rows } = await this.pool.query(`SELECT * FROM solution_bundles WHERE key = $1`, [key]);
    return rows[0] ? mapBundle(rows[0]) : null;
  }

  async listBundles(opts?: { activeOnly?: boolean }): Promise<SolutionBundle[]> {
    const where = opts?.activeOnly ? "WHERE is_active = true" : "";
    const { rows } = await this.pool.query(`SELECT * FROM solution_bundles ${where} ORDER BY category, name`);
    return rows.map(mapBundle);
  }

  async addServiceToBundle(bundleId: string, serviceId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO bundle_services (bundle_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [bundleId, serviceId],
    );
  }

  async removeServiceFromBundle(bundleId: string, serviceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM bundle_services WHERE bundle_id = $1 AND service_id = $2`, [bundleId, serviceId]);
  }

  async listServicesInBundle(bundleId: string): Promise<string[]> {
    const { rows } = await this.pool.query(`SELECT service_id FROM bundle_services WHERE bundle_id = $1`, [bundleId]);
    return rows.map((r) => r.service_id);
  }

  async upsertOrgBundleSelection(selection: OrgBundleSelection): Promise<void> {
    await this.pool.query(
      `INSERT INTO org_bundle_selections (id, organization_id, bundle_id, status, trial_expires_at, attached_at, cancelled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, bundle_id) DO UPDATE SET
         status = EXCLUDED.status,
         trial_expires_at = EXCLUDED.trial_expires_at,
         attached_at = EXCLUDED.attached_at,
         cancelled_at = EXCLUDED.cancelled_at`,
      [
        selection.id,
        selection.organizationId,
        selection.bundleId,
        selection.status,
        selection.trialExpiresAt,
        selection.attachedAt,
        selection.cancelledAt,
      ],
    );
  }

  async getOrgBundleSelection(organizationId: string, bundleId: string): Promise<OrgBundleSelection | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM org_bundle_selections WHERE organization_id = $1 AND bundle_id = $2`,
      [organizationId, bundleId],
    );
    return rows[0] ? mapBundleSelection(rows[0]) : null;
  }

  async listOrgBundleSelections(organizationId: string): Promise<OrgBundleSelection[]> {
    const { rows } = await this.pool.query(`SELECT * FROM org_bundle_selections WHERE organization_id = $1`, [organizationId]);
    return rows.map(mapBundleSelection);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCategory(row: any): Category {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    displayOrder: row.display_order,
    isActive: row.is_active,
    navigationPath: row.navigation_path,
    icon: row.icon,
    color: row.color,
    requiredPermission: row.required_permission,
  };
}

function mapService(row: any): Service {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    isActive: row.is_active,
    minimumPlanCode: row.minimum_plan_code,
    defaultAddOnStripePriceId: row.default_add_on_stripe_price_id,
    isAddOnEligible: row.is_add_on_eligible,
    supportsTrial: row.supports_trial,
    monthlyPriceCents: row.monthly_price_cents,
    usageMeterKey: row.usage_meter_key,
    entitlementKey: row.entitlement_key,
    featureFlagKey: row.feature_flag_key,
    navigationPath: row.navigation_path,
    icon: row.icon,
    color: row.color,
    requiredPermission: row.required_permission,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTierAvailability(row: any): ServiceTierAvailability {
  return {
    id: row.id,
    serviceId: row.service_id,
    planCode: row.plan_code,
    availabilityType: row.availability_type,
    addOnStripePriceId: row.add_on_stripe_price_id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSelection(row: any): OrgServiceSelection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    serviceId: row.service_id,
    status: row.status,
    trialExpiresAt: row.trial_expires_at,
    attachedAt: row.attached_at,
    cancelledAt: row.cancelled_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDisableOverride(row: any): ServiceDisableOverride {
  return {
    id: row.id,
    serviceId: row.service_id,
    organizationId: row.organization_id,
    reason: row.reason,
    cause: row.cause,
    estimatedResolution: row.estimated_resolution,
    createdAt: row.created_at,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBundle(row: any): SolutionBundle {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    isActive: row.is_active,
    minimumPlanCode: row.minimum_plan_code,
    monthlyPriceCents: row.monthly_price_cents,
    stripePriceId: row.stripe_price_id,
    supportsTrial: row.supports_trial,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBundleSelection(row: any): OrgBundleSelection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    bundleId: row.bundle_id,
    status: row.status,
    trialExpiresAt: row.trial_expires_at,
    attachedAt: row.attached_at,
    cancelledAt: row.cancelled_at,
  };
}
