import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import { generateOrgHash } from "./privacy.js";

/**
 * One observation of a threat pattern at a specific org, stored with the
 * org identity already hashed -- this table is the source of truth for
 * `ThreatPattern.totalObservations` / `affectedOrganizationsCount`
 * (computed via COUNT(*) and COUNT(DISTINCT organization_hash) against
 * it), which is a deliberate correctness improvement over Aegis's
 * original `report_threat_observation`: that version increments
 * `affected_organizations_count` unconditionally on every call, so the
 * same org reporting the same pattern twice inflates the "how many
 * different organizations were affected" count. Storing every
 * observation and counting distinct org hashes fixes that without
 * losing anything Aegis's version provided.
 */
export interface ThreatPatternObservation {
  id: string;
  threatPatternId: string;
  organizationHash: string;
  industry: string | null;
  severityScore: number;
  occurredAt: Date;
  receivedAt: Date;
}

export interface DataSharingLogEntry {
  id: string;
  organizationId: string;
  organizationHash: string;
  dataType: "risk_signal" | "threat_observation" | "benchmark_data";
  recordCount: number;
  anonymizationApplied: boolean;
  differentialPrivacyApplied: boolean;
  consentVersion: string;
  sharingPurpose: string;
  retentionUntil: Date;
  createdAt: Date;
  /** Set by retentionCleanup.ts's softDeleteExpiredSharingLogs once retentionUntil has passed -- the row stays (it IS the audit trail), just marked. */
  deletedAt: Date | null;
}

export interface ReportObservationInput {
  organizationId: string;
  /** The human-readable patternId (e.g. "THREAT-2026-001"), not the internal UUID -- this is what Aegis's local detector actually has on hand, matching what it synced via distribution.ts. */
  patternId: string;
  industry?: string;
  severityScore: number;
}

export interface ReportObservationResult {
  accepted: boolean;
  reason?: "no_consent" | "pattern_not_found";
}

const ORG_HASH_SALT_ENV_FALLBACK = "command-center-dev-salt-do-not-use-in-production";

/**
 * Salt for org hashing. In production this MUST come from a real secret
 * (e.g. an env var backed by a secrets manager), not the fallback here
 * -- the fallback exists only so this module has a deterministic,
 * non-crashing default for tests and local dev, the same "fail loud in
 * prod, sane default in dev" spirit as backend/api's DATABASE_URL check,
 * except a missing salt doesn't need to be fatal the way a missing DB
 * URL does (it doesn't lose data, it just makes hashes predictable,
 * which is a deployment misconfiguration, not a startup blocker).
 * Whoever wires this into backend/api should read a real ORG_HASH_SALT
 * env var and pass it in, not rely on this default.
 */
export function resolveOrgHashSalt(envValue: string | undefined): string {
  return envValue ?? ORG_HASH_SALT_ENV_FALLBACK;
}

/**
 * Reports an observation of a threat pattern. Mirrors Aegis's
 * `report_threat_observation`: consent-gated (returns accepted: false,
 * not a thrown error, if the org hasn't opted in -- an unconsented
 * report is a normal, expected outcome for Aegis to check, not a
 * failure), silently returns accepted: false for an unknown patternId
 * rather than throwing (Aegis's local pattern library could be
 * momentarily stale relative to Command Center's).
 */
export async function reportThreatObservation(
  repo: ThreatIntelRepository,
  input: ReportObservationInput,
  orgHashSalt: string,
  now: Date = new Date(),
): Promise<ReportObservationResult> {
  const consent = await repo.getConsent(input.organizationId);
  if (!consent || !consent.shareThreatPatterns || consent.revokedAt) {
    return { accepted: false, reason: "no_consent" };
  }

  const pattern = await repo.getPatternByPatternId(input.patternId);
  if (!pattern) {
    return { accepted: false, reason: "pattern_not_found" };
  }

  const organizationHash = generateOrgHash(input.organizationId, orgHashSalt);

  await repo.appendObservation({
    id: randomUUID(),
    threatPatternId: pattern.id,
    organizationHash,
    industry: input.industry ?? null,
    severityScore: input.severityScore,
    occurredAt: now,
    receivedAt: now,
  });

  const [totalObservations, affectedOrganizationsCount] = await Promise.all([
    repo.countObservationsForPattern(pattern.id),
    repo.countDistinctOrgsForPattern(pattern.id),
  ]);

  // Running average, same formula as Aegis: (avg * (n-1) + newScore) / n,
  // where n is the post-insert total so the new observation is weighted
  // correctly alongside every prior one.
  const avgSeverityScore =
    (pattern.avgSeverityScore * (totalObservations - 1) + input.severityScore) / totalObservations;

  const affectedIndustries = new Set(pattern.affectedIndustries ?? []);
  if (input.industry) affectedIndustries.add(input.industry);

  await repo.updatePattern({
    ...pattern,
    lastObserved: now,
    totalObservations,
    affectedOrganizationsCount,
    avgSeverityScore,
    affectedIndustries: affectedIndustries.size > 0 ? [...affectedIndustries] : null,
    updatedAt: now,
  });

  await repo.recordDataSharingLog({
    id: randomUUID(),
    organizationId: input.organizationId,
    organizationHash,
    dataType: "threat_observation",
    recordCount: 1,
    anonymizationApplied: true,
    // Individual observations are NOT differential-privacy-noised, only
    // aggregates (a future risk-signal-collection phase) are -- matches
    // Aegis's own report_threat_observation, which sets this false too.
    differentialPrivacyApplied: false,
    consentVersion: consent.consentVersion,
    sharingPurpose: "threat_intelligence",
    retentionUntil: new Date(now.getTime() + consent.dataRetentionDays * 24 * 60 * 60 * 1000),
    createdAt: now,
    deletedAt: null,
  });

  return { accepted: true };
}
