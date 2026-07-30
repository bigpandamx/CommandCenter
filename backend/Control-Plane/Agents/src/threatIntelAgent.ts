import type { ThreatIntelRepository } from "../../Threat-Intelligence/src/repository.js";
import type { AgentTaskResult } from "./types.js";
import type { AgentHandler } from "./orchestrator.js";

const DEFAULT_STALE_DAYS = 14;
const GRADUATION_DETECTION_THRESHOLD = 20;

/**
 * Two checks, both read-only / recommend-only:
 *   1. Active, non-false-positive threat patterns that have gone
 *      `staleDays` since creation without ever being verified by an
 *      analyst -- these keep getting distributed to every Aegis
 *      deployment (distribution.ts doesn't gate on verifiedByAnalyst,
 *      only on isActive/isFalsePositive) without anyone having actually
 *      confirmed they're real.
 *   2. Experimental prompt-abuse signatures that have accumulated
 *      enough real-world detections to be worth promoting out of
 *      experimental status -- flags candidates for
 *      `graduateSignature`, doesn't call it itself.
 */
export function createAuditThreatIntelHandler(
  threatIntelRepo: ThreatIntelRepository,
  staleDays: number = DEFAULT_STALE_DAYS,
): AgentHandler {
  return async (payload: Record<string, unknown>): Promise<AgentTaskResult> => {
    const thresholdDays = typeof payload.staleDays === "number" ? payload.staleDays : staleDays;
    const now = new Date();
    const cutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

    const activePatterns = await threatIntelRepo.searchPatterns({ isActive: true });
    const unverifiedStale = activePatterns.filter(
      (p) => !p.isFalsePositive && !p.verifiedByAnalyst && p.createdAt.getTime() < cutoff.getTime(),
    );

    const activeSignatures = await threatIntelRepo.searchSignatures({ isActive: true });
    const readyToGraduate = activeSignatures.filter(
      (s) => s.isExperimental && s.totalDetections >= GRADUATION_DETECTION_THRESHOLD,
    );

    const recommendations: string[] = [
      ...unverifiedStale.map(
        (p) =>
          `Pattern "${p.patternName}" (${p.patternId}) has been active and unverified for over ${thresholdDays} days -- review and verify or mark as a false positive.`,
      ),
      ...readyToGraduate.map(
        (s) =>
          `Signature "${s.signatureName}" (${s.signatureId}) has ${s.totalDetections} detections while still experimental -- consider graduating it.`,
      ),
    ];

    return {
      success: true,
      summary:
        recommendations.length === 0
          ? "No unverified stale patterns or graduation-ready signatures found."
          : `${unverifiedStale.length} unverified stale pattern(s), ${readyToGraduate.length} signature(s) ready to graduate.`,
      actionsTaken: [],
      recommendations,
      data: {
        staleThresholdDays: thresholdDays,
        unverifiedStalePatternIds: unverifiedStale.map((p) => p.id),
        graduationCandidateSignatureIds: readyToGraduate.map((s) => s.id),
      },
    };
  };
}
