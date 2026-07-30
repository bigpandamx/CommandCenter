import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import {
  getOrganizationProfile,
  getLicenseUsage,
  getOrganizationCatalog,
  getOrganizationTierProgression,
  getOrganizationCompliancePacks,
  listEnrollmentTokens,
  listTelemetry,
  listCustomerPoliciesForOrganization,
  listControlsForCustomerPolicy,
  listComplianceControls,
  listBusinessAssets,
  AdminApiError,
} from "../../../../lib/adminApiClient";
import { LicenseUsageCard } from "../../../../components/LicenseUsageCard";
import { EnrollmentTokenList } from "../../../../components/EnrollmentTokenList";
import { TelemetryTable } from "../../../../components/TelemetryTable";
import { ProfileCard } from "../../../../components/ProfileCard";
import { IdChip } from "../../../../components/IdChip";
import { StatusDot } from "../../../../components/StatusDot";
import { CatalogView } from "../../../../components/CatalogView";
import { TierProgressionView } from "../../../../components/TierProgressionView";
import { CompliancePacksView } from "../../../../components/CompliancePacksView";
import { CustomerPoliciesView } from "../../../../components/CustomerPoliciesView";
import { BusinessAssetsView } from "../../../../components/BusinessAssetsView";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const config = await requireSession();

  // getOrganizationProfile replaces the old listOrganizations()+find()
  // approach -- it's a single direct lookup now that Command Center
  // exposes one, and it also gives us the profile in the same call.
  // Profile is optional: an org created via the old quick-create path
  // (name + tier only, no contact info) has no profile row, and that's a
  // legitimate state, not an error -- handled below by treating a 404
  // specifically from this call as "no profile yet" rather than failing
  // the whole page.
  const [profileResult, usage, { tokens }, { events }, catalog, tierProgression, { results: packResults }, customerPolicies, { controls: allControls }, { assets: businessAssets }] = await Promise.all([
    getOrganizationProfile(config, organizationId).catch((err) => {
      if (err instanceof AdminApiError && err.status === 404) return null;
      throw err;
    }),
    getLicenseUsage(config, organizationId),
    listEnrollmentTokens(config, organizationId),
    listTelemetry(config, organizationId, { limit: 25 }),
    // An org with no active subscription has nothing to compute catalog
    // access against -- CatalogView/TierProgressionView both render a
    // clear "no active subscription" state for null rather than this
    // page failing outright.
    getOrganizationCatalog(config, organizationId).catch((err) => {
      if (err instanceof AdminApiError && err.status === 404) return null;
      throw err;
    }),
    getOrganizationTierProgression(config, organizationId).catch((err) => {
      if (err instanceof AdminApiError && err.status === 404) return null;
      throw err;
    }),
    getOrganizationCompliancePacks(config, organizationId),
    listCustomerPoliciesForOrganization(config, organizationId),
    listComplianceControls(config),
    listBusinessAssets(config, organizationId),
  ]);

  const org = profileResult?.organization;

  // Resolved per-policy, after the main fetch -- each policy's own
  // mapped-control list depends on the policy id itself, so it can't
  // be folded into the Promise.all above.
  const customerPoliciesWithControls = await Promise.all(
    customerPolicies.policies.map(async (p) => {
      const { controls } = await listControlsForCustomerPolicy(config, p.id);
      return { ...p, mappedControls: controls.map((c) => ({ key: c.key, code: c.code, name: c.name })) };
    }),
  );

  return (
    <div>
      <Link href="/organizations" className="text-xs text-text-muted hover:text-text-primary">
        ← Organizations
      </Link>

      <div className="mt-2 mb-6 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-primary">{org?.name ?? organizationId}</h1>
        {org && <StatusDot status={org.entitlementTier}>{org.entitlementTier}</StatusDot>}
        <IdChip value={organizationId} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <LicenseUsageCard usage={usage} />
        <div className="md:col-span-2">
          <EnrollmentTokenList organizationId={organizationId} tokens={tokens} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <TelemetryTable events={events} />
        </div>
        {profileResult ? (
          <ProfileCard organizationId={organizationId} profile={profileResult.profile} />
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Profile</p>
            <p className="mt-2 text-sm text-text-muted">
              This organization was created without a profile (the quick-create path only captures name and tier).
              There's no edit-in-place path to add one yet -- it would need to go through sign-up intake again.
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <CatalogView organizationId={organizationId} catalog={catalog} />
        <TierProgressionView progression={tierProgression} />
      </div>
      <div className="mt-4">
        <CompliancePacksView results={packResults} />

        <CustomerPoliciesView
          organizationId={organizationId}
          policies={customerPoliciesWithControls}
          allControls={allControls.map((c) => ({ key: c.key, code: c.code, name: c.name }))}
        />
      </div>
      <div className="mt-4">
        <BusinessAssetsView organizationId={organizationId} assets={businessAssets} />
      </div>
    </div>
  );
}
