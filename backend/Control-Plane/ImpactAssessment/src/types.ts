/**
 * Impact Assessment Engine -- the pipeline stage after Knowledge Base:
 * given a compliance obligation, decide which organizations are
 * actually affected, and why. Genuinely new: depends on BOTH
 * Control-Plane/Compliance (the obligation/document data) and
 * Control-Plane/Organizations (the org data to match against) as
 * first-class inputs, which is why this is its own module rather than
 * folded into either -- the same reasoning that made
 * Platform-Services/Entitlements its own module instead of living
 * inside Subscriptions.
 *
 * Scoped to what's reliably available to match against today:
 * `OrganizationProfile.country` and `.industry`. The original vision
 * also named Region, Products, AI Usage, and Compliance Packs as
 * matching dimensions -- Region is covered by `country` (no
 * `state`-level field exists on OrganizationProfile, so state-specific
 * obligations can't be narrowed further than country from the org
 * side); Products, AI Usage, and Compliance Packs are NOT matched this
 * round. Products has a real candidate data source
 * (Platform-Services/ServiceCatalog's org service/bundle selections),
 * but wiring that in is a genuine scope increase -- a different
 * module's data model, not just another field read off
 * OrganizationProfile -- left for a deliberate follow-up, not silently
 * attempted here.
 *
 * The core policy, stated once so it's not scattered across
 * conditionals: an organization is never excluded on a dimension
 * that's unknown on EITHER side. If the document doesn't specify a
 * country, or the org hasn't set one, country isn't used to rule
 * anyone out -- same for industry. Only a definitive mismatch (both
 * sides known, and different) excludes an organization. In a
 * compliance system, a missed notification is worse than an
 * unnecessary one -- this is a deliberate "when in doubt, don't rule
 * it out" default, not an oversight, and it's exactly why every
 * exclusion in `assessImpact` requires both sides of the comparison to
 * be genuinely known.
 */

export interface ImpactMatch {
  affected: boolean;
  /** Human-readable, e.g. "You operate in DE." or "This document applies to DE; your organization operates in US." -- always populated, whether affected or not, so a "not affected" result is explainable, not just a bare false. */
  reasons: string[];
}

/**
 * The full, actionable result for one organization against one
 * obligation -- what Distribution (the next, not-yet-built pipeline
 * stage) would turn into an actual "Impact Alert." riskLevel/
 * actionItems come from the obligation's parent document's own AI
 * Analysis, when one exists -- null/empty when the document hasn't
 * been analyzed yet, not fabricated.
 */
export interface OrganizationImpact {
  organizationId: string;
  organizationName: string;
  obligationId: string;
  updateId: string;
  affected: boolean;
  reasons: string[];
  riskLevel: string | null;
  actionItems: string[];
}

export class ImpactAssessmentError extends Error {
  constructor(
    message: string,
    public readonly code: "obligation_not_found" | "update_not_found",
  ) {
    super(message);
    this.name = "ImpactAssessmentError";
  }
}
