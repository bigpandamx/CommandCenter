/**
 * A managed, ordered category -- see 0032_service_categories.sql for
 * why Service.category (still a free string) isn't hard-FK'd to this:
 * enforcement for new services is meant to happen via the Service
 * Editor's category field becoming a dropdown of real categories, not
 * a migration that could fail against data it can't see. A service
 * whose category string doesn't match any real category key here
 * falls back to an "Uncategorized" bucket at read time -- see
 * computeCategorizedCatalogForOrganization.
 */
export interface Category {
  id: string;
  /** Stable identifier, e.g. "ai". */
  key: string;
  /** Display name, e.g. "AI". */
  name: string;
  /** Deliberate render order -- not alphabetical. Lower renders first. */
  displayOrder: number;
  isActive: boolean;
  /**
   * Null means this category isn't a top-level nav item -- most
   * categories won't be. Non-null means Aegis's frontend can build a
   * nav entry for it without hardcoding anything: path/icon/color are
   * pure display metadata this backend never interprets, and
   * requiredPermission is pass-through metadata for Aegis's own
   * customer-facing permission model (not Command Center's staff
   * RBAC, a completely separate system) -- this backend stores and
   * returns it, never evaluates it.
   */
  navigationPath: string | null;
  icon: string | null;
  color: string | null;
  requiredPermission: string | null;
}

export interface Service {
  id: string;
  /** Stable identifier, e.g. "developer-sandbox" -- code references this, never the UUID, so a catalog re-seed doesn't break existing references. */
  key: string;
  name: string;
  description: string;
  /** Free text ("ai", "compliance", "automation", "infrastructure", "identity", ...) -- deliberately not an enum; a new category shouldn't require a migration. */
  category: string;
  /** Catalog-wide retirement switch -- an inactive service shouldn't appear in the catalog at all. Distinct from ServiceDisableOverride, which is "temporarily unavailable but still listed." */
  isActive: boolean;
  /**
   * Eligibility shortcut: the lowest plan (by subscription_plans.base_price_cents
   * rank) an org must be on to purchase this service, WITHOUT needing an
   * explicit service_tier_availability row for every qualifying plan.
   * Null means no automatic floor -- eligibility is entirely
   * matrix-driven (today's original behavior). Ignored entirely if this
   * service has ANY explicit tier-availability rows at all -- see
   * resolveEffectiveTierAvailability's own doc comment for why this is
   * deliberately all-or-nothing, not a per-tier fallback.
   */
  minimumPlanCode: string | null;
  /** The Stripe price used when eligibility is derived from minimumPlanCode rather than an explicit matrix row. Null if not billed yet. */
  defaultAddOnStripePriceId: string | null;
  /** Master switch: if false, this service can never be attached as an add-on regardless of what the tier matrix or minimumPlanCode say -- a safety property for services meant to only ever be tier-included. */
  isAddOnEligible: boolean;
  /** If false, attachAddOn rejects trial: true for this service outright -- some services (e.g. Air-Gapped Deployment) shouldn't be trialable at all. */
  supportsTrial: boolean;
  /** Display-only "sticker price" for catalog UI -- independent of the actual Stripe price(s) wired to specific tiers/rows, which is what's actually charged. Null if not priced for display yet. */
  monthlyPriceCents: number | null;
  /** A label referencing a usage-metering concept (e.g. "threat-events") -- metadata only in this piece; no metering enforcement is built yet. Null if this service isn't usage-metered. */
  usageMeterKey: string | null;
  /**
   * The actual bridge into backend access control: the string key a
   * `hasEntitlement(org, key)`-style check looks for. Null means this
   * service is catalog/display-only and grants no backend entitlement
   * on its own (e.g. it exists purely to satisfy another service's
   * dependency, or is UI metadata with nothing to gate).
   */
  entitlementKey: string | null;
  /**
   * Optional additional gate: even when otherwise entitled (via tier,
   * add-on, or dependency), this service's entitlement is suppressed if
   * this feature flag evaluates false for the org. Null means no
   * additional gate -- entitlement is governed purely by subscription
   * state. See computeFinalEntitlements for where this is applied.
   */
  featureFlagKey: string | null;
  /**
   * Same UI-declaration fields as Category, at the more granular
   * per-service level -- a category rendering its member services
   * (e.g. AI: Chat, Agents, Voice, Vision) needs each service to be
   * able to declare its own icon/color, not just inherit the
   * category's. navigationPath here is for deep-linking to a specific
   * service's own page (e.g. "/compliance/ai-reports"), distinct from
   * Category.navigationPath's top-level section link. All pure
   * pass-through metadata, same reasoning as Category's own fields --
   * this backend stores and returns them, never interprets or
   * enforces them.
   */
  navigationPath: string | null;
  icon: string | null;
  color: string | null;
  requiredPermission: string | null;
}

export interface SolutionBundle {
  id: string;
  /** Stable identifier, e.g. "agriculture-bundle". */
  key: string;
  name: string;
  description: string;
  /** Typically an industry: "agriculture", "manufacturing", "healthcare". Free text, same reasoning as Service.category. */
  category: string;
  isActive: boolean;
  /** Same semantics as Service.minimumPlanCode -- null means no automatic floor. */
  minimumPlanCode: string | null;
  monthlyPriceCents: number | null;
  stripePriceId: string | null;
  supportsTrial: boolean;
}

export type OrgBundleSelectionStatus = "active" | "trial" | "cancelled";

export interface OrgBundleSelection {
  id: string;
  organizationId: string;
  bundleId: string;
  status: OrgBundleSelectionStatus;
  trialExpiresAt: Date | null;
  attachedAt: Date;
  cancelledAt: Date | null;
}

export type TierAvailabilityType = "included" | "addable" | "unavailable";

export interface ServiceTierAvailability {
  id: string;
  serviceId: string;
  /** References subscription_plans.code -- a tier IS a subscription plan, not a separate concept. */
  planCode: string;
  availabilityType: TierAvailabilityType;
  /** Only meaningful when availabilityType === "addable". Null if this add-on isn't billed yet (not launched, or free). */
  addOnStripePriceId: string | null;
}

export type OrgServiceSelectionStatus = "active" | "trial" | "cancelled";

export interface OrgServiceSelection {
  id: string;
  organizationId: string;
  serviceId: string;
  status: OrgServiceSelectionStatus;
  /** Only meaningful when status === "trial". */
  trialExpiresAt: Date | null;
  attachedAt: Date;
  cancelledAt: Date | null;
}

export type DisableCause = "maintenance" | "policy" | "admin_action";

export interface ServiceDisableOverride {
  id: string;
  serviceId: string;
  /** Null means a GLOBAL override (every org). Non-null scopes it to one org (e.g. a policy action against a specific customer). */
  organizationId: string | null;
  reason: string;
  cause: DisableCause;
  estimatedResolution: Date | null;
  createdAt: Date;
  createdBy: string | null;
  /** Null means still active. Overrides are resolved by setting this, not deleted -- keeps a record of what was disabled and for how long. */
  resolvedAt: Date | null;
}

/**
 * The four-state model a UI actually renders. A discriminated union,
 * not a flat struct with optional fields -- each state carries
 * fundamentally different data, and a flat shape would let invalid
 * combinations compile (a "trial" with no expiration, a "locked" with
 * no reason). "locked" itself splits into two distinct unlock paths
 * with different upsell UX: add_on (purchasable at the org's current
 * tier, no tier change needed) vs upgrade_tier (only reachable by
 * upgrading).
 */
export type UnlockPath =
  | { type: "add_on"; serviceId: string; addOnStripePriceId: string | null }
  | { type: "upgrade_tier"; targetPlanCode: string };

export type ServiceAvailability =
/**
 * "available" carries `source` because three genuinely different
 * situations all reach this state, and only one of them is something
 * an org can cancel from here: `tier_included` (comes with the plan,
 * nothing to cancel), `bundle` (granted by a solution bundle purchase
 * -- cancelled via cancelBundle, not this service individually), and
 * `add_on` (a direct OrgServiceSelection the org purchased on its
 * own -- the only case cancelAddOn actually applies to; calling it on
 * either of the other two throws selection_not_found, since neither
 * has a selection row to cancel).
 */
  | { state: "available"; source: "tier_included" | "bundle" | "add_on" }
  | { state: "locked"; reason: string; unlockPath: UnlockPath }
  | { state: "trial"; expiresAt: Date; daysRemaining: number }
  | { state: "disabled"; reason: string; cause: DisableCause; estimatedResolution: Date | null };

/**
 * The diagnostic outcome for one dependency, computed relative to an
 * org's current catalog state -- see resolveDependencyRequirements.
 * Deliberately not just "satisfied: boolean": the three real outcomes
 * need different UI treatment --
 *   - already_satisfied: nothing to show, or a quiet checkmark.
 *   - can_auto_attach: "this will also be added" -- actionable, safe
 *     to resolve automatically with confirmation.
 *   - requires_upgrade / disabled: genuinely blocking -- attaching the
 *     requested service isn't possible until this is addressed some
 *     other way (upgrade a tier, wait out a maintenance window).
 */
export type DependencyRequirementStatus = "already_satisfied" | "can_auto_attach" | "requires_upgrade" | "disabled";

export interface DependencyRequirement {
  service: Service;
  status: DependencyRequirementStatus;
  /** Only meaningful when status === "requires_upgrade". */
  requiresPlanCode?: string;
  /** Only meaningful when status === "disabled". */
  reason?: string;
}

export class ServiceCatalogError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "service_not_found"
      | "duplicate_key"
      | "invalid_key"
      | "plan_not_found"
      | "selection_not_found"
      | "bundle_not_found"
      | "category_not_found"
      | "dependency_not_satisfied",
    /** Only populated for dependency_not_satisfied -- the exact requirements blocking the attach, so a caller can render "requires Analytics (needs Business tier)" without re-parsing the message string. */
    public readonly unsatisfiedDependencies?: DependencyRequirement[],
  ) {
    super(message);
    this.name = "ServiceCatalogError";
  }
}
