/**
 * Organization Impact: "which organizations are exposed" -- the stage
 * that finally connects everything upstream (Risk Factors, Risk
 * Models, Risk Assessments, Risk Treatments) to Distribution. Checked
 * directly before building anything: Risk-Intelligence's own
 * underlying signal data (Threat-Intelligence/src/riskSignals.ts) is
 * anonymized with real differential privacy -- generateOrgHash, count
 * noise, a real epsilon budget per anonymization level -- specifically
 * so individual organizations CANNOT be identified or targeted from
 * network-wide patterns. That's not incidental; it's the entire point
 * of aggregating across orgs in the first place.
 *
 * Which means Organization Impact here can never work the way
 * Compliance's own does -- country/industry/product/control precision,
 * naming specific orgs by real identity from rich matching logic.
 * Doing that here would mean reversing the exact anonymization this
 * codebase deliberately built. The honest ceiling is industry-level
 * matching: the same, coarse grouping Risk Notices already used, now
 * formalized as its own inspectable stage instead of buried inline
 * inside distribution.
 *
 * The real value this stage adds isn't more precision -- it's
 * SEPARATING assessment from distribution, the same split Compliance's
 * own assessObligationImpact/findAffectedOrganizations already has
 * over distributeObligationImpact: a staff member can now see exactly
 * who a risk assessment would reach BEFORE deciding to actually
 * generate and publish notices, not just find out after the fact.
 */
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { searchOrganizations } from "../../Organizations/src/profileSearch.js";

export interface OrganizationRiskImpact {
  organizationId: string;
  organizationName: string;
  industry: string;
  affected: boolean;
  reasons: string[];
}

/**
 * Every organization gets a result, affected or not -- the same "show
 * who was excluded and why" shape assessObligationImpact already
 * uses, not just the ones that match. An org with no industry
 * recorded is excluded, not included -- see notificationGeneration.ts's
 * own doc comment for why this deliberately does NOT follow
 * Compliance's broader "never exclude on unknown" default: an
 * industry-level risk notice claiming relevance to an org whose
 * industry isn't even known would be a weaker match than Compliance's
 * own reasoning ever needed to defend.
 */
export async function assessRiskImpactForIndustry(
  orgsRepo: OrganizationsRepository,
  industry: string,
): Promise<OrganizationRiskImpact[]> {
  const orgs = await searchOrganizations(orgsRepo, {});

  return orgs.map(({ organization, profile }) => {
    const affected = profile.industry === industry;
    const reasons = affected
      ? [`You operate in the ${industry} industry.`]
      : profile.industry === null
        ? [`This assessment applies to the ${industry} industry; your organization's industry isn't set, so this can't be confirmed as relevant.`]
        : [`This assessment applies to the ${industry} industry; your organization is in the ${profile.industry} industry.`];

    return {
      organizationId: organization.id,
      organizationName: organization.name,
      industry,
      affected,
      reasons,
    };
  });
}

/** The narrower, more common case: only the organizations actually affected -- what a staff member deciding whether to distribute actually wants to see. */
export async function findOrganizationsAffectedByIndustryRisk(
  orgsRepo: OrganizationsRepository,
  industry: string,
): Promise<OrganizationRiskImpact[]> {
  const all = await assessRiskImpactForIndustry(orgsRepo, industry);
  return all.filter((impact) => impact.affected);
}
