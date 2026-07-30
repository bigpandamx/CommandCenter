import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import { generateOrgHash } from "./privacy.js";

/**
 * Reports that a prompt abuse signature matched, mirroring the counting
 * side of Aegis's `detect_prompt_abuse` (which increments
 * `total_detections` / `last_detection` directly when a signature
 * matches). Aegis's version runs the actual keyword-matching detection
 * itself; that stays in Aegis deliberately -- it's real-time, in the hot
 * path of every prompt, and Aegis already has the synced signature
 * library locally (via distribution.ts) to match against without a
 * network round-trip per prompt. What Command Center needs is just the
 * reporting side: "this signature fired," so the network-wide detection
 * count reflects reality.
 *
 * This closes a real gap from Phase 1: `PromptAbuseSignature.totalDetections`
 * and `.lastDetection` were ported as fields from Aegis's model, but
 * nothing in this module ever set them -- there was no equivalent of
 * `reportThreatObservation` for signatures. Same distinct-org-counting
 * fix applied here as observations.ts's improvement over Aegis's
 * pattern-observation counting: `discoveredFromOrgCount` is computed
 * from a real detection-events table via COUNT(DISTINCT organization_hash),
 * not incremented unconditionally.
 */

export interface SignatureDetectionEvent {
  id: string;
  signatureId: string;
  /** Null when reported without an org context (e.g. a synthetic/test detection) -- organizationHash, never the raw id, when present. */
  organizationHash: string | null;
  detectedAt: Date;
}

export interface ReportSignatureDetectionInput {
  signatureId: string;
  /** Optional -- unlike reportThreatObservation, this isn't consent-gated, since it's reporting that a *signature matched*, not sharing an org's own risk data. An org identity is only used for discoveredFromOrgCount's distinct-count tracking, and only the hash is ever stored. */
  organizationId?: string;
}

export interface ReportSignatureDetectionResult {
  accepted: boolean;
  reason?: "signature_not_found";
}

export async function reportSignatureDetection(
  repo: ThreatIntelRepository,
  input: ReportSignatureDetectionInput,
  orgHashSalt: string,
  now: Date = new Date(),
): Promise<ReportSignatureDetectionResult> {
  const signature = await repo.getSignatureBySignatureId(input.signatureId);
  if (!signature) {
    return { accepted: false, reason: "signature_not_found" };
  }

  const organizationHash = input.organizationId ? generateOrgHash(input.organizationId, orgHashSalt) : null;

  await repo.appendSignatureDetection({
    id: randomUUID(),
    signatureId: signature.id,
    organizationHash,
    detectedAt: now,
  });

  const [totalDetections, discoveredFromOrgCount] = await Promise.all([
    repo.countDetectionsForSignature(signature.id),
    repo.countDistinctOrgsForSignature(signature.id),
  ]);

  await repo.updateSignature({
    ...signature,
    totalDetections,
    discoveredFromOrgCount,
    lastDetection: now,
    updatedAt: now,
  });

  return { accepted: true };
}
