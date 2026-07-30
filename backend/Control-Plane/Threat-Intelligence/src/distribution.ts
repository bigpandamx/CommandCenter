import type { ThreatIntelRepository } from "./repository.js";
import type { PromptAbuseSignature, ThreatActor, ThreatPattern, Vulnerability } from "./types.js";

export interface DistributionOptions {
  /** Only patterns/signatures updated at or after this time -- incremental sync, same cursor pattern as Compliance's listUpdates(since). */
  since?: Date;
}

/**
 * What Aegis pulls to refresh its local threat pattern library. Always
 * active-only and false-positive-excluded -- a distribution feed should
 * never hand a customer's enforcement engine something known to be
 * wrong. Unverified-but-not-yet-disproven patterns ARE included
 * (verifiedByAnalyst is a confidence signal for Aegis's own logic to use
 * if it wants to weight detections differently, not a gate on
 * distribution itself).
 */
export async function getPatternsForDistribution(
  repo: ThreatIntelRepository,
  options: DistributionOptions = {},
): Promise<ThreatPattern[]> {
  const patterns = await repo.searchPatterns({ isActive: true, updatedSince: options.since });
  return patterns.filter((p) => !p.isFalsePositive);
}

export async function getSignaturesForDistribution(
  repo: ThreatIntelRepository,
  options: DistributionOptions = {},
): Promise<PromptAbuseSignature[]> {
  return repo.searchSignatures({ isActive: true, updatedSince: options.since });
}

/**
 * What Aegis pulls for its local CVE reference data. No
 * isActive/isFalsePositive concept exists for a Vulnerability the way
 * it does for a ThreatPattern -- a stored CVE is a real NVD record by
 * definition, not a detection that could be wrong. Everything in the
 * current window is distributable; `since` is purely an incremental-
 * sync cursor, not a correctness filter.
 */
export async function getVulnerabilitiesForDistribution(
  repo: ThreatIntelRepository,
  options: DistributionOptions = {},
): Promise<Vulnerability[]> {
  return repo.searchVulnerabilities({ lastModifiedSince: options.since, limit: 5000 });
}

/**
 * What Aegis pulls for its local threat actor reference data.
 * Active-only, same "never distribute something known to be stale"
 * principle as patterns -- a group MITRE or staff has marked inactive
 * (disbanded, absorbed into another group, etc.) shouldn't keep
 * showing up in a customer's enforcement context.
 */
export async function getThreatActorsForDistribution(
  repo: ThreatIntelRepository,
  options: DistributionOptions = {},
): Promise<ThreatActor[]> {
  return repo.searchThreatActors({ isActive: true, updatedSince: options.since, limit: 5000 });
}
