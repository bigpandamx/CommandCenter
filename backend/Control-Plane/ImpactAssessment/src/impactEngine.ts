import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { ComplianceObligation, ComplianceUpdate } from "../../Compliance/src/types.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { searchOrganizations } from "../../Organizations/src/profileSearch.js";
import type { OrganizationProfile } from "../../Organizations/src/profileTypes.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { resolveOrgProductKeys } from "./packMatching.js";
import { ImpactAssessmentError, type ImpactMatch, type OrganizationImpact } from "./types.js";

/**
 * Pure, deterministic matching -- no repository access, fully
 * unit-testable in isolation. See this module's own doc comment
 * (types.ts) for the "never exclude on an unknown dimension" policy
 * this implements.
 */
export function assessImpact(
  orgProfile: Pick<OrganizationProfile, "industry" | "country">,
  obligation: Pick<ComplianceObligation, "industries">,
  parentUpdate: Pick<ComplianceUpdate, "country">,
): ImpactMatch {
  const reasons: string[] = [];
  let excluded = false;

  // Region/country: the document's jurisdiction lives on the parent
  // update, not the obligation itself (a whole document has one
  // governing jurisdiction; individual obligations within it can still
  // vary by industry, which is checked separately below).
  if (parentUpdate.country !== null) {
    if (orgProfile.country === null) {
      reasons.push(
        `This document applies to ${parentUpdate.country}; your organization's region isn't set, so this can't be ruled out.`,
      );
    } else if (orgProfile.country === parentUpdate.country) {
      reasons.push(`You operate in ${orgProfile.country}.`);
    } else {
      excluded = true;
      reasons.push(
        `This document applies to ${parentUpdate.country}; your organization operates in ${orgProfile.country}.`,
      );
    }
  }

  // Industry: checked against the OBLIGATION's own industries, which
  // may be narrower than the parent document's overall industries --
  // this is exactly why obligations carry their own industries field
  // rather than inheriting the document's.
  if (obligation.industries.length > 0) {
    if (orgProfile.industry === null) {
      reasons.push(
        `This obligation applies to ${obligation.industries.join(", ")}; your organization's industry isn't set, so this can't be ruled out.`,
      );
    } else if (obligation.industries.includes(orgProfile.industry)) {
      reasons.push(`You operate in the ${orgProfile.industry} industry.`);
    } else {
      excluded = true;
      reasons.push(
        `This obligation applies to ${obligation.industries.join(", ")}; your organization is in the ${orgProfile.industry} industry.`,
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push("This document doesn't specify a region or industry, so it can't be ruled out for any organization.");
  }

  return { affected: !excluded, reasons };
}

/**
 * The control-derived chain: obligation -> its mapped controls ->
 * every pack that requires any of those controls -> the union of
 * their requiredProductKeys. An organization owning ANY of these
 * products is affected through that ownership, independent of
 * country/industry -- additive to assessImpact's own determination,
 * never a substitute for it (a Command Center decision: an org can be
 * affected via EITHER path, matching this module's "never exclude,
 * union rather than intersect" philosophy applied one level higher).
 *
 * Empty when the obligation has no mapped controls yet, or none of its
 * controls are required by any pack -- a real, common state (most
 * obligations won't have this chain fully built out), not an error.
 */
async function computeControlDerivedProductKeys(complianceRepo: ComplianceRepository, obligationId: string): Promise<string[]> {
  const controls = await complianceRepo.listControlsForObligation(obligationId);
  const productKeys = new Set<string>();
  for (const control of controls) {
    const packs = await complianceRepo.listPacksForControl(control.id);
    for (const pack of packs) {
      for (const key of pack.requiredProductKeys) {
        productKeys.add(key);
      }
    }
  }
  return [...productKeys];
}

/**
 * Orchestrates: fetches the obligation, its parent document, and (if
 * one exists) its AI Analysis, checks every organization via BOTH
 * assessImpact (country/industry) and the control-derived product
 * chain, and returns the full, actionable result set -- `affected:
 * true` AND `affected: false` results both, since a staff member
 * investigating a specific obligation's reach benefits from seeing who
 * was excluded and why, not just who wasn't. See
 * `findAffectedOrganizations` below for the narrower, more common
 * "who do I need to tell" case, pre-filtered to affected only.
 *
 * catalogRepo/billingRepo are needed only for the product chain --
 * threaded through even when computeControlDerivedProductKeys turns up
 * empty, since that's determined per-obligation, not knowable by the
 * caller in advance.
 */
export async function assessObligationImpact(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  obligationId: string,
): Promise<OrganizationImpact[]> {
  const obligation = await complianceRepo.getObligationById(obligationId);
  if (!obligation) {
    throw new ImpactAssessmentError(`Unknown obligation: ${obligationId}`, "obligation_not_found");
  }
  const update = await complianceRepo.getUpdateById(obligation.updateId);
  if (!update) {
    // A real data-integrity problem (an obligation whose parent update
    // is missing), not a normal "not found" -- surfaced loudly rather
    // than silently treated as "no impact anywhere."
    throw new ImpactAssessmentError(
      `Obligation ${obligationId} references missing update ${obligation.updateId}`,
      "update_not_found",
    );
  }

  const analysis = await complianceRepo.getAnalysisForUpdate(update.id);
  const orgs = await searchOrganizations(orgsRepo, {});
  const relevantProductKeys = await computeControlDerivedProductKeys(complianceRepo, obligationId);

  const results: OrganizationImpact[] = [];
  for (const { organization, profile } of orgs) {
    const geoMatch = assessImpact(profile, obligation, update);

    let productMatch = false;
    const reasons = [...geoMatch.reasons];
    // Skipped entirely when there's nothing to check -- most
    // obligations won't have a control-derived chain built out yet,
    // and there's no reason to resolve every org's product list
    // against an empty set.
    if (relevantProductKeys.length > 0) {
      const orgProductKeys = await resolveOrgProductKeys(catalogRepo, billingRepo, organization.id);
      const matchedProducts = relevantProductKeys.filter((key) => orgProductKeys.includes(key));
      if (matchedProducts.length > 0) {
        productMatch = true;
        reasons.push(
          `You own ${matchedProducts.join(", ")}, which ${matchedProducts.length === 1 ? "is" : "are"} tied to a control this document affects.`,
        );
      }
    }

    results.push({
      organizationId: organization.id,
      organizationName: organization.name,
      obligationId: obligation.id,
      updateId: update.id,
      affected: geoMatch.affected || productMatch,
      reasons,
      riskLevel: analysis?.riskLevel ?? null,
      actionItems: analysis?.actionItems ?? [],
    });
  }
  return results;
}

/** The narrower, more common case: only the organizations actually affected -- the "who do I need to tell" list. */
export async function findAffectedOrganizations(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  obligationId: string,
): Promise<OrganizationImpact[]> {
  const all = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligationId);
  return all.filter((impact) => impact.affected);
}
