import type { Organization } from "./types.js";

/**
 * An organization's profile: the intake/contact/demographic information
 * captured at sign-up, kept separate from the core Organization record
 * (Customer-Connections/Desktop-Apps's shared type) rather than bolted
 * onto it. Organization is used across Desktop-Apps, Licensing, and
 * elsewhere with a small, stable shape; widening it here would ripple
 * required-field changes through every module that constructs an
 * Organization in tests. A 1:1 side table keyed by organizationId keeps
 * that blast radius contained to this module.
 */

export type CompanySize = "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";

export interface OrganizationProfile {
  organizationId: string;
  /** URL-safe, globally unique, human-readable identifier -- e.g. for a future org-scoped URL or for staff to reference an org verbally/in tickets without copy-pasting a UUID. Auto-generated from the org name at signup if not explicitly provided. */
  slug: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string | null;
  industry: string | null;
  companySize: CompanySize | null;
  website: string | null;
  country: string | null;
  notes: string | null;
  /**
   * The org's own disclosed infrastructure/vendor footprint -- open
   * vocabulary (a plain string, not a closed enum), matching this
   * codebase's established free-form-over-closed-enum convention: a
   * new cloud/AI/device vendor shouldn't require a schema migration to
   * record. Explicit, disclosed data the org already trusts Command
   * Center with, the same way industry/country already are -- NOT
   * derived from Risk Intelligence's own anonymized cross-org signal
   * aggregates, and genuinely unrelated to that privacy boundary. What
   * makes "a critical OpenAI outage" resolvable to "which specific
   * orgs does this actually affect" instead of staying an industry-wide
   * guess -- see Risk-Intelligence/src/vendorImpactService.ts's own
   * doc comment for how this gets used.
   *
   * Default to an empty array, never undefined -- an org that hasn't
   * disclosed a vendor footprint yet is a real, ordinary state (not
   * every org will fill this in immediately after signup), not an
   * error or a null case every caller needs to guard against
   * separately.
   */
  cloudProviders: string[];
  aiProviders: string[];
  deviceTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SignupInput {
  organizationName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
  industry?: string | null;
  companySize?: CompanySize | null;
  website?: string | null;
  country?: string | null;
  notes?: string | null;
  cloudProviders?: string[];
  aiProviders?: string[];
  deviceTypes?: string[];
  /** Optional explicit override; auto-generated from organizationName if omitted. */
  slug?: string | null;
}

export interface SignupResult {
  organization: Organization;
  profile: OrganizationProfile;
}

export interface OrganizationSearchQuery {
  /** Case-insensitive substring match against name, slug, primary contact name, and primary contact email. */
  text?: string;
  industry?: string;
  companySize?: CompanySize;
  /** Exact match against a single entry in the org's own disclosed cloudProviders array -- e.g. "aws" finds every org that lists AWS among (possibly several) cloud providers. */
  cloudProvider?: string;
  aiProvider?: string;
  deviceType?: string;
}

export interface OrganizationWithProfile {
  organization: Organization;
  profile: OrganizationProfile;
}
