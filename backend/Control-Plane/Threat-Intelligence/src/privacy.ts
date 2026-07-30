import { createHash } from "node:crypto";

/**
 * Differential privacy primitives, ported from Aegis's
 * `NetworkIntelligenceService._generate_org_hash` /
 * `_apply_differential_privacy` / `_apply_count_noise` (Python, using
 * numpy's Laplace sampler) rather than reinvented -- CUTOVER.md's stated
 * approach for this migration. Node has no numpy equivalent, so the
 * Laplace sampling here uses the standard inverse-CDF method for a
 * Laplace(0, scale) distribution, which is mathematically equivalent to
 * numpy's implementation, not merely similar.
 *
 * Math.random() is deliberately used instead of node:crypto's random
 * functions -- this is statistical noise calibrated for a privacy
 * budget, not a secret needing cryptographic unpredictability, and
 * Math.random() is the conventional, correct tool for that.
 */

export type AnonymizationLevel = "high" | "medium" | "low";

/** Matches Aegis's epsilon_map exactly: lower epsilon = more noise = more privacy. */
export const EPSILON_BY_ANONYMIZATION_LEVEL: Record<AnonymizationLevel, number> = {
  high: 0.5,
  medium: 1.0,
  low: 2.0,
};

/**
 * SHA-256 hash of organizationId + salt -- a one-way, salt-dependent
 * anonymized identifier. Same organizationId + salt always produces the
 * same hash (needed so repeated observations from the same org can be
 * recognized as the same org without storing the org id itself); a
 * different salt (e.g. rotated periodically) produces an unlinkable hash.
 */
export function generateOrgHash(organizationId: string, salt: string): string {
  return createHash("sha256").update(`${organizationId}:${salt}`).digest("hex");
}

function sampleLaplaceNoise(scale: number): number {
  // Inverse-CDF sampling for Laplace(0, scale): u ~ Uniform(-0.5, 0.5),
  // then X = -scale * sign(u) * ln(1 - 2|u|).
  const u = Math.random() - 0.5;
  const sign = u < 0 ? -1 : 1;
  return -scale * sign * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Applies the Laplace mechanism: adds calibrated noise to `value`,
 * clamped to non-negative (matches Aegis's `max(0.0, value + noise)` --
 * counts and severity scores are never meaningfully negative, so
 * clamping doesn't lose real information, only impossible noise draws).
 */
export function applyDifferentialPrivacy(value: number, epsilon = 1.0, sensitivity = 1.0): number {
  const scale = sensitivity / epsilon;
  const noise = sampleLaplaceNoise(scale);
  return Math.max(0, value + noise);
}

export function applyCountNoise(count: number, epsilon = 1.0): number {
  const noisy = applyDifferentialPrivacy(count, epsilon, 1.0);
  return Math.max(0, Math.round(noisy));
}
