/**
 * The Products dimension of the original Impact Assessment vision
 * (Organization -> Region -> Products -> Industry -> AI Usage ->
 * Compliance Packs -> Affected). Kept separate from impactEngine.ts
 * (country/industry matching) specifically because of its dependency
 * footprint: resolving an org's real product list needs ServiceCatalog
 * AND Billing (a tier-included product has no explicit selection row,
 * so a correct answer needs the org's plan code and the full tier
 * matrix, not just a simple selections lookup) -- a materially larger
 * dependency chain than country/industry ever needed, worth isolating
 * in its own file rather than folding into impactEngine.ts's existing
 * shape.
 */
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import { computeCatalogForOrganization } from "../../../Platform-Services/ServiceCatalog/src/serviceCatalogService.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { getPlanForSubscription } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { ComplianceControl, CompliancePack } from "../../Compliance/src/types.js";

/**
 * Pure, deterministic matching -- no repository access, same style as
 * assessImpact. Unlike country/industry (which can be genuinely unset
 * on a profile, hence the "never exclude on unknown" policy),
 * requiredProductKeys and orgProductKeys are always knowable (possibly
 * empty, never "unknown") -- there's no unknown-dimension branch to
 * write here. An unscoped pack (no required products at all) is never
 * applicable -- it hasn't been configured to match anything yet, which
 * is different from "applies to everyone."
 */
export function assessPackApplicability(
  orgProductKeys: string[],
  pack: Pick<CompliancePack, "requiredProductKeys">,
): { applicable: boolean; reasons: string[] } {
  if (pack.requiredProductKeys.length === 0) {
    return { applicable: false, reasons: ["This pack isn't scoped to any product yet."] };
  }

  const matchedProducts = pack.requiredProductKeys.filter((key) => orgProductKeys.includes(key));
  if (matchedProducts.length > 0) {
    return { applicable: true, reasons: [`You have: ${matchedProducts.join(", ")}.`] };
  }

  return {
    applicable: false,
    reasons: [`This pack requires one of: ${pack.requiredProductKeys.join(", ")}; your organization has none of these.`],
  };
}

/**
 * An org's real product list -- every service genuinely available to
 * them right now, tier-included or explicitly attached add-on alike (a
 * raw org_service_selections lookup would miss tier-included products
 * entirely, since those need no selection row at all -- see this
 * file's own doc comment). Trial products count: an org actively
 * trialing a product is using it, and compliance obligations don't
 * wait for the trial to convert. An org with no active subscription
 * has no resolvable plan code and so, correctly, no products -- not an
 * error, just an empty list.
 */
export async function resolveOrgProductKeys(
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  organizationId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const subscription = await billingRepo.getActiveSubscriptionForOrg(organizationId);
  if (!subscription) return [];

  const plan = await getPlanForSubscription(billingRepo, subscription);
  const catalog = await computeCatalogForOrganization(catalogRepo, organizationId, plan.code, now);

  return catalog
    .filter((entry) => entry.availability.state === "available" || entry.availability.state === "trial")
    .map((entry) => entry.service.key);
}

export interface PackMatch {
  pack: CompliancePack;
  applicable: boolean;
  reasons: string[];
  controls: ComplianceControl[];
}

/** Every pack, matched against this org's real product list, with bundled controls resolved for the applicable ones. */
export async function computeApplicablePacksForOrganization(
  complianceRepo: ComplianceRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  organizationId: string,
  now: Date = new Date(),
): Promise<PackMatch[]> {
  const orgProductKeys = await resolveOrgProductKeys(catalogRepo, billingRepo, organizationId, now);
  const packs = await complianceRepo.listPacks();

  const results: PackMatch[] = [];
  for (const pack of packs) {
    const match = assessPackApplicability(orgProductKeys, pack);
    const controls = match.applicable ? await complianceRepo.listControlsForPack(pack.id) : [];
    results.push({ pack, applicable: match.applicable, reasons: match.reasons, controls });
  }
  return results;
}
