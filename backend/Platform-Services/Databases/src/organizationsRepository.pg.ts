/**
 * Postgres implementation of Control-Plane/Organizations's
 * OrganizationsRepository port. Backed by the same `organizations` and
 * `enrollment_tokens` tables as PgDesktopSyncRepository -- see the port
 * doc-comment for why that's intentional. Same caveat as
 * desktopSyncRepository.pg.ts: written against `pg`'s documented API,
 * type-checked, not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { EnrollmentToken, Organization } from "../../../Control-Plane/Organizations/src/types.js";
import type { OrganizationProfile, OrganizationSearchQuery } from "../../../Control-Plane/Organizations/src/profileTypes.js";

export class PgOrganizationsRepository implements OrganizationsRepository {
  constructor(private readonly pool: Pool) {}

  async createOrganization(org: Organization): Promise<void> {
    await this.pool.query(
      `INSERT INTO organizations (id, name, entitlement_tier, created_at)
       VALUES ($1, $2, $3, $4)`,
      [org.id, org.name, org.entitlementTier, org.createdAt],
    );
  }

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, entitlement_tier, stripe_customer_id, created_at FROM organizations WHERE id = $1`,
      [organizationId],
    );
    return rows[0] ? mapOrganization(rows[0]) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const { rows } = await this.pool.query(
      `SELECT id, name, entitlement_tier, stripe_customer_id, created_at FROM organizations ORDER BY created_at DESC`,
    );
    return rows.map(mapOrganization);
  }

  async updateEntitlementTier(
    organizationId: string,
    tier: Organization["entitlementTier"],
  ): Promise<void> {
    await this.pool.query(
      `UPDATE organizations SET entitlement_tier = $2 WHERE id = $1`,
      [organizationId, tier],
    );
  }

  async updateStripeCustomerId(organizationId: string, stripeCustomerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE organizations SET stripe_customer_id = $2 WHERE id = $1`,
      [organizationId, stripeCustomerId],
    );
  }

  async createEnrollmentToken(token: EnrollmentToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO enrollment_tokens
         (token, organization_id, created_at, expires_at, consumed_at, max_uses, use_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token.token,
        token.organizationId,
        token.createdAt,
        token.expiresAt,
        token.consumedAt,
        token.maxUses,
        token.useCount,
      ],
    );
  }

  async listEnrollmentTokens(organizationId: string): Promise<EnrollmentToken[]> {
    const { rows } = await this.pool.query(
      `SELECT token, organization_id, created_at, expires_at, consumed_at, max_uses, use_count
         FROM enrollment_tokens
        WHERE organization_id = $1
        ORDER BY created_at DESC`,
      [organizationId],
    );
    return rows.map(mapEnrollmentToken);
  }

  async revokeEnrollmentToken(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE enrollment_tokens SET expires_at = now() WHERE token = $1`,
      [token],
    );
  }

  async createProfile(profile: OrganizationProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO organization_profiles
         (organization_id, slug, primary_contact_name, primary_contact_email, primary_contact_phone,
          industry, company_size, website, country, notes, cloud_providers, ai_providers, device_types, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        profile.organizationId,
        profile.slug,
        profile.primaryContactName,
        profile.primaryContactEmail,
        profile.primaryContactPhone,
        profile.industry,
        profile.companySize,
        profile.website,
        profile.country,
        profile.notes,
        profile.cloudProviders,
        profile.aiProviders,
        profile.deviceTypes,
        profile.createdAt,
        profile.updatedAt,
      ],
    );
  }

  async getProfileByOrganizationId(organizationId: string): Promise<OrganizationProfile | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM organization_profiles WHERE organization_id = $1`,
      [organizationId],
    );
    return rows[0] ? mapProfile(rows[0]) : null;
  }

  async getProfileBySlug(slug: string): Promise<OrganizationProfile | null> {
    const { rows } = await this.pool.query(`SELECT * FROM organization_profiles WHERE slug = $1`, [slug]);
    return rows[0] ? mapProfile(rows[0]) : null;
  }

  async updateProfile(profile: OrganizationProfile): Promise<void> {
    await this.pool.query(
      `UPDATE organization_profiles SET
         slug = $2, primary_contact_name = $3, primary_contact_email = $4, primary_contact_phone = $5,
         industry = $6, company_size = $7, website = $8, country = $9, notes = $10,
         cloud_providers = $11, ai_providers = $12, device_types = $13, updated_at = $14
       WHERE organization_id = $1`,
      [
        profile.organizationId,
        profile.slug,
        profile.primaryContactName,
        profile.primaryContactEmail,
        profile.primaryContactPhone,
        profile.industry,
        profile.companySize,
        profile.website,
        profile.country,
        profile.notes,
        profile.cloudProviders,
        profile.aiProviders,
        profile.deviceTypes,
        profile.updatedAt,
      ],
    );
  }

  async searchProfiles(query: OrganizationSearchQuery): Promise<OrganizationProfile[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.text) {
      params.push(`%${query.text}%`);
      const p = params.length;
      // Joins organizations for the name match -- the only profile field
      // search needs from outside organization_profiles itself.
      conditions.push(
        `(o.name ILIKE $${p} OR op.slug ILIKE $${p} OR op.primary_contact_name ILIKE $${p} OR op.primary_contact_email ILIKE $${p})`,
      );
    }
    if (query.industry) {
      params.push(query.industry);
      conditions.push(`op.industry = $${params.length}`);
    }
    if (query.companySize) {
      params.push(query.companySize);
      conditions.push(`op.company_size = $${params.length}`);
    }
    if (query.cloudProvider) {
      params.push(query.cloudProvider);
      conditions.push(`$${params.length} = ANY(op.cloud_providers)`);
    }
    if (query.aiProvider) {
      params.push(query.aiProvider);
      conditions.push(`$${params.length} = ANY(op.ai_providers)`);
    }
    if (query.deviceType) {
      params.push(query.deviceType);
      conditions.push(`$${params.length} = ANY(op.device_types)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT op.* FROM organization_profiles op
         JOIN organizations o ON o.id = op.organization_id
       ${whereClause}
       ORDER BY op.created_at DESC`,
      params,
    );
    return rows.map(mapProfile);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    entitlementTier: row.entitlement_tier,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEnrollmentToken(row: any): EnrollmentToken {
  return {
    token: row.token,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfile(row: any): OrganizationProfile {
  return {
    organizationId: row.organization_id,
    slug: row.slug,
    primaryContactName: row.primary_contact_name,
    primaryContactEmail: row.primary_contact_email,
    primaryContactPhone: row.primary_contact_phone,
    industry: row.industry,
    companySize: row.company_size,
    website: row.website,
    country: row.country,
    notes: row.notes,
    cloudProviders: row.cloud_providers ?? [],
    aiProviders: row.ai_providers ?? [],
    deviceTypes: row.device_types ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
