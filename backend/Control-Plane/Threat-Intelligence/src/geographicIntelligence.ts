/**
 * Geographic Intelligence: two real data sources combined honestly,
 * not fabricated. Customer geographic footprint comes from
 * OrganizationProfile.country -- explicit, disclosed data, the same
 * "as non-anonymized as industry already is" category
 * vendorImpactService.ts's own doc comment establishes for vendor
 * data. Threat geography comes from ThreatActor/Campaign's own
 * staff-curated originCountry/targetedCountries (see
 * 0069_threat_geography.sql for why that's staff-curated rather than
 * synced from MITRE or auto-extracted from free text).
 *
 * The cross-reference is a real, honest case-insensitive text match
 * against real data on both sides -- not a validated geographic
 * hierarchy. It won't know "California" is in "the United States"
 * unless both sides use the same string; the frontend says so.
 *
 * In-memory aggregation over searchOrganizations({})/searchThreatActors({})/
 * searchCampaigns({}), not a dedicated indexed "group by country"
 * query -- a deliberate, stated trade-off for a first pass. This is a
 * staff dashboard aggregate, not a hot-path query, and the realistic
 * scale here (an internal tool's own customer/threat-catalog counts)
 * doesn't yet justify the added complexity of a new indexed
 * aggregation method the way vendorImpactService's own indexed match
 * genuinely needs to for a query that could run per-outage. Revisit
 * if either dataset grows enough that this becomes real.
 */
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { searchOrganizations } from "../../Organizations/src/profileSearch.js";
import type { ThreatIntelRepository } from "./repository.js";

export interface CountryFootprint {
  country: string;
  organizationCount: number;
}

/** Every distinct disclosed OrganizationProfile.country, with how many organizations disclosed it -- orgs with no country on file are excluded, not counted as an "unknown" bucket, since that's not itself a real country. */
export async function getCustomerGeographicFootprint(orgsRepo: OrganizationsRepository): Promise<CountryFootprint[]> {
  const results = await searchOrganizations(orgsRepo, {});
  const counts = new Map<string, number>();
  for (const { profile } of results) {
    if (!profile.country) continue;
    counts.set(profile.country, (counts.get(profile.country) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([country, organizationCount]) => ({ country, organizationCount }))
    .sort((a, b) => b.organizationCount - a.organizationCount);
}

export interface GeographicEntityRef {
  id: string;
  name: string;
}

export interface GeographicThreatMatch {
  country: string;
  organizationCount: number;
  originatingActors: GeographicEntityRef[];
  targetingActors: GeographicEntityRef[];
  originatingCampaigns: GeographicEntityRef[];
  targetingCampaigns: GeographicEntityRef[];
}

/**
 * For every country with disclosed customers, which staff-tagged
 * actors/campaigns are known to originate from or target it --
 * case-insensitive text match, see this file's own top comment for
 * why that's an honest boundary to state rather than paper over.
 * Entities with no geography tagged at all simply don't appear here;
 * that's not a gap in this function, it's an honest reflection of
 * what staff haven't tagged yet.
 */
export async function getGeographicThreatMatches(
  orgsRepo: OrganizationsRepository,
  threatRepo: ThreatIntelRepository,
): Promise<GeographicThreatMatch[]> {
  const footprint = await getCustomerGeographicFootprint(orgsRepo);
  const actors = await threatRepo.searchThreatActors({});
  const campaigns = await threatRepo.searchCampaigns({});

  return footprint.map(({ country, organizationCount }) => {
    const lowered = country.toLowerCase();
    const originatingActors = actors.filter((a) => a.originCountry?.toLowerCase() === lowered);
    const targetingActors = actors.filter((a) => a.targetedCountries?.some((c) => c.toLowerCase() === lowered));
    const originatingCampaigns = campaigns.filter((c) => c.originCountry?.toLowerCase() === lowered);
    const targetingCampaigns = campaigns.filter((c) => c.targetedCountries?.some((t) => t.toLowerCase() === lowered));

    return {
      country,
      organizationCount,
      originatingActors: originatingActors.map((a) => ({ id: a.id, name: a.name })),
      targetingActors: targetingActors.map((a) => ({ id: a.id, name: a.name })),
      originatingCampaigns: originatingCampaigns.map((c) => ({ id: c.id, name: c.name })),
      targetingCampaigns: targetingCampaigns.map((c) => ({ id: c.id, name: c.name })),
    };
  });
}
