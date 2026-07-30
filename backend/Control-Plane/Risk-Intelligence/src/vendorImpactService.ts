/**
 * Vendor Impact: "a critical OpenAI outage" resolved to the specific
 * organizations that actually use OpenAI -- not every org in a given
 * industry, the way assessRiskImpactForIndustry is necessarily
 * limited to. This is the real differentiator named directly: Risk
 * Intelligence knowing about a customer's own disclosed environment
 * (OrganizationProfile.cloudProviders/aiProviders/deviceTypes),
 * genuinely more precise than industry-level matching, and NOT in
 * tension with the differential-privacy boundary
 * organizationImpactService.ts's own doc comment establishes -- that
 * boundary is about Risk Intelligence's own anonymized cross-org
 * signal aggregates, not about an org's own disclosed profile data,
 * which is exactly as explicit and non-anonymized as industry or
 * country already are. A vendor outage is also public, external
 * information, not derived from any customer's private signal data.
 *
 * Matching is a real, indexed database query (see
 * 0060_organization_vendor_profile.sql's own GIN indexes), not an
 * in-memory scan -- this needs to stay fast as the organization base
 * grows, the same reasoning behind every other real, indexed query in
 * this codebase (listFailedJobRuns, getActiveRiskModelForDetectorType,
 * ...).
 */
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { searchOrganizations } from "../../Organizations/src/profileSearch.js";
import type { VendorCategory } from "./types.js";

export interface OrganizationVendorImpact {
  organizationId: string;
  organizationName: string;
  vendor: string;
  category: VendorCategory;
}

/**
 * Only the organizations that actually disclosed using this vendor --
 * unlike assessRiskImpactForIndustry, there's no "show who was
 * excluded and why" variant here. An org simply not using a vendor
 * isn't a meaningful exclusion reason worth surfacing the way "wrong
 * industry" or "wrong country" is -- it would just be every other org
 * in the system, restated.
 */
export async function findOrganizationsUsingVendor(
  orgsRepo: OrganizationsRepository,
  vendor: string,
  category: VendorCategory,
): Promise<OrganizationVendorImpact[]> {
  const query =
    category === "cloud" ? { cloudProvider: vendor } : category === "ai" ? { aiProvider: vendor } : { deviceType: vendor };

  const orgs = await searchOrganizations(orgsRepo, query);

  return orgs.map(({ organization }) => ({
    organizationId: organization.id,
    organizationName: organization.name,
    vendor,
    category,
  }));
}
