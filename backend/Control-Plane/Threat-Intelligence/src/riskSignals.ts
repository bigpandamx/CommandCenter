import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import { generateOrgHash, applyCountNoise, EPSILON_BY_ANONYMIZATION_LEVEL } from "./privacy.js";

/**
 * Risk signal aggregation, matching Aegis's `collect_risk_signals` /
 * `RiskSignalAggregate`. Aegis owns the raw data this is computed from
 * (deployment records, audit logs) -- Command Center never sees it.
 * What crosses the boundary is a pre-computed local count Aegis relays
 * (e.g. "14 deployment failures out of 230 total deployments in the
 * last 24h"), which this module then applies differential privacy noise
 * to before storing -- same division of responsibility as everywhere
 * else in this module: Aegis computes/owns its operational data,
 * Command Center anonymizes and aggregates across orgs.
 */

export type RiskSignalType =
  | "deployment_failure"
  | "policy_violation"
  | "audit_anomaly"
  | "prompt_injection"
  | "data_leakage"
  | "bias_detection"
  | "performance_degradation"
  | "compliance_gap"
  | "security_incident";

export interface RiskSignalAggregate {
  id: string;
  organizationHash: string;
  signalType: RiskSignalType;
  industry: string;
  /** Differential-privacy-noised count -- never the raw value Aegis reported. */
  signalCount: number;
  totalDeploymentsCount: number;
  avgSeverityScore: number;
  maxSeverityScore: number;
  noiseEpsilon: number;
  aggregationWindowHours: number;
  signalStartTime: Date;
  signalEndTime: Date;
  createdAt: Date;
}

export interface ReportRiskSignalInput {
  organizationId: string;
  signalType: RiskSignalType;
  industry: string;
  /** Aegis's own locally-computed raw count -- e.g. failed deployments in the window. Noised before storage; never persisted as-is. */
  rawSignalCount: number;
  totalDeploymentsCount: number;
  severityScore: number;
  aggregationWindowHours?: number;
}

export interface ReportRiskSignalResult {
  accepted: boolean;
  reason?: "no_consent";
}

const DEFAULT_WINDOW_HOURS = 24;

/**
 * Reports a risk signal. Consent-gated on `shareRiskSignals` (distinct
 * from `shareThreatPatterns`, which gates observations.ts -- an org can
 * opt into one without the other). Unlike reportThreatObservation, the
 * count itself is noised immediately at write time (matching Aegis's
 * `collect_risk_signals`, which applies `_apply_count_noise` before
 * ever storing the aggregate) rather than stored raw -- risk signal
 * aggregates ARE the shared artifact, not an internal record later
 * queried through a privacy-preserving view.
 */
export async function reportRiskSignal(
  repo: ThreatIntelRepository,
  input: ReportRiskSignalInput,
  orgHashSalt: string,
  now: Date = new Date(),
): Promise<ReportRiskSignalResult> {
  const consent = await repo.getConsent(input.organizationId);
  if (!consent || !consent.shareRiskSignals || consent.revokedAt) {
    return { accepted: false, reason: "no_consent" };
  }

  const epsilon = EPSILON_BY_ANONYMIZATION_LEVEL[consent.anonymizationLevel];
  const windowHours = input.aggregationWindowHours ?? DEFAULT_WINDOW_HOURS;
  const organizationHash = generateOrgHash(input.organizationId, orgHashSalt);

  const aggregate: RiskSignalAggregate = {
    id: randomUUID(),
    organizationHash,
    signalType: input.signalType,
    industry: input.industry,
    signalCount: applyCountNoise(input.rawSignalCount, epsilon),
    totalDeploymentsCount: applyCountNoise(input.totalDeploymentsCount, epsilon),
    avgSeverityScore: Math.min(1, Math.max(0, input.severityScore)),
    maxSeverityScore: Math.min(1, input.severityScore * 1.2),
    noiseEpsilon: epsilon,
    aggregationWindowHours: windowHours,
    signalStartTime: new Date(now.getTime() - windowHours * 60 * 60 * 1000),
    signalEndTime: now,
    createdAt: now,
  };

  await repo.createRiskSignalAggregate(aggregate);

  await repo.recordDataSharingLog({
    id: randomUUID(),
    organizationId: input.organizationId,
    organizationHash,
    dataType: "risk_signal",
    recordCount: 1,
    anonymizationApplied: true,
    differentialPrivacyApplied: true,
    consentVersion: consent.consentVersion,
    sharingPurpose: "network_intelligence",
    retentionUntil: new Date(now.getTime() + consent.dataRetentionDays * 24 * 60 * 60 * 1000),
    createdAt: now,
    deletedAt: null,
  });

  return { accepted: true };
}
