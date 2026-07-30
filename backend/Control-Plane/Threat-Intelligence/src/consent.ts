import type { ThreatIntelRepository } from "./repository.js";
import type { AnonymizationLevel } from "./privacy.js";

export type { AnonymizationLevel };

/**
 * Explicit opt-in consent for network intelligence sharing, matching
 * Aegis's OrganizationConsent fields. Privacy-first: every flag defaults
 * to false. This is deliberately simpler than Aegis's version -- it
 * drops `consented_by_user_id`/`consent_ip_address`/`consent_user_agent`
 * (those are browser-session audit details that belong with whatever UI
 * actually captures the consent action, which today is Aegis's own
 * dashboard, not Command Center) and `share_audit_insights` /
 * `allow_cross_industry_insights` (not used by anything built in Phase
 * 1 or 2 -- add them back if a later phase actually needs them, rather
 * than carrying unused fields now).
 */
export interface OrganizationConsent {
  organizationId: string;
  shareRiskSignals: boolean;
  shareThreatPatterns: boolean;
  shareBenchmarkData: boolean;
  anonymizationLevel: AnonymizationLevel;
  dataRetentionDays: number;
  consentVersion: string;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}

export interface SetConsentInput {
  shareRiskSignals?: boolean;
  shareThreatPatterns?: boolean;
  shareBenchmarkData?: boolean;
  anonymizationLevel?: AnonymizationLevel;
  dataRetentionDays?: number;
}

const CURRENT_CONSENT_VERSION = "v1.0";
const DEFAULT_RETENTION_DAYS = 365;

export async function getConsent(
  repo: ThreatIntelRepository,
  organizationId: string,
): Promise<OrganizationConsent | null> {
  return repo.getConsent(organizationId);
}

/**
 * Creates or updates an org's consent settings. Unspecified fields keep
 * their previous value (or the privacy-first default of false/high on
 * first creation) -- this is a partial update, not a full replace, so a
 * caller toggling one flag doesn't need to know or resend every other
 * flag's current value.
 */
export async function setConsent(
  repo: ThreatIntelRepository,
  organizationId: string,
  input: SetConsentInput,
  now: Date = new Date(),
): Promise<OrganizationConsent> {
  const existing = await repo.getConsent(organizationId);

  const consent: OrganizationConsent = {
    organizationId,
    shareRiskSignals: input.shareRiskSignals ?? existing?.shareRiskSignals ?? false,
    shareThreatPatterns: input.shareThreatPatterns ?? existing?.shareThreatPatterns ?? false,
    shareBenchmarkData: input.shareBenchmarkData ?? existing?.shareBenchmarkData ?? false,
    anonymizationLevel: input.anonymizationLevel ?? existing?.anonymizationLevel ?? "high",
    dataRetentionDays: input.dataRetentionDays ?? existing?.dataRetentionDays ?? DEFAULT_RETENTION_DAYS,
    consentVersion: CURRENT_CONSENT_VERSION,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    revokedAt: null, // any explicit setConsent call implies active consent, even if previously revoked
  };

  await repo.upsertConsent(consent);
  return consent;
}

/** Turns every sharing flag off and stamps revokedAt -- distinct from setConsent({...: false}) so "revoked" is an explicit, queryable state, not just an inference from all-false flags. */
export async function revokeConsent(
  repo: ThreatIntelRepository,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationConsent> {
  const existing = await repo.getConsent(organizationId);

  const consent: OrganizationConsent = {
    organizationId,
    shareRiskSignals: false,
    shareThreatPatterns: false,
    shareBenchmarkData: false,
    anonymizationLevel: existing?.anonymizationLevel ?? "high",
    dataRetentionDays: existing?.dataRetentionDays ?? DEFAULT_RETENTION_DAYS,
    consentVersion: CURRENT_CONSENT_VERSION,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    revokedAt: now,
  };

  await repo.upsertConsent(consent);
  return consent;
}
