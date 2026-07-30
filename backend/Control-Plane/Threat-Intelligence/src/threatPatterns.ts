import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { CreateThreatPatternInput, ThreatPattern } from "./types.js";

export class ThreatPatternError extends Error {
  constructor(
    message: string,
    public readonly code: "pattern_not_found" | "invalid_input" | "duplicate_pattern_id",
  ) {
    super(message);
    this.name = "ThreatPatternError";
  }
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

function assertUnitInterval(value: number, fieldName: string): void {
  if (value < 0 || value > 1) {
    throw new ThreatPatternError(`${fieldName} must be between 0.0 and 1.0, got ${value}`, "invalid_input");
  }
}

export async function createThreatPattern(
  repo: ThreatIntelRepository,
  input: CreateThreatPatternInput,
  now: Date = new Date(),
): Promise<ThreatPattern> {
  if (!input.patternId.trim()) {
    throw new ThreatPatternError("patternId is required", "invalid_input");
  }
  if (!input.patternName.trim() || !input.description.trim() || !input.attackVector.trim()) {
    throw new ThreatPatternError("patternName, description, and attackVector are required", "invalid_input");
  }

  const confidenceThreshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  assertUnitInterval(confidenceThreshold, "confidenceThreshold");
  assertUnitInterval(input.avgSeverityScore, "avgSeverityScore");
  if (input.successRate !== undefined) {
    assertUnitInterval(input.successRate, "successRate");
  }

  const existing = await repo.getPatternByPatternId(input.patternId);
  if (existing) {
    throw new ThreatPatternError(`patternId "${input.patternId}" already exists`, "duplicate_pattern_id");
  }

  const pattern: ThreatPattern = {
    id: randomUUID(),
    patternId: input.patternId.trim(),
    patternName: input.patternName.trim(),
    threatType: input.threatType,
    severity: input.severity,
    description: input.description.trim(),
    attackVector: input.attackVector.trim(),
    indicatorsOfCompromise: input.indicatorsOfCompromise ?? null,
    detectionSignature: input.detectionSignature,
    confidenceThreshold,
    firstObserved: now,
    lastObserved: now,
    totalObservations: 0,
    affectedOrganizationsCount: 0,
    affectedIndustries: input.affectedIndustries ?? null,
    avgSeverityScore: input.avgSeverityScore,
    successRate: input.successRate ?? null,
    estimatedPrevalence: input.estimatedPrevalence ?? null,
    mitigationSteps: input.mitigationSteps ?? null,
    remediationGuidance: input.remediationGuidance ?? null,
    isActive: true,
    isFalsePositive: false,
    verifiedByAnalyst: false,
    externalReferences: input.externalReferences ?? null,
    relatedPatternIds: input.relatedPatternIds ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repo.createPattern(pattern);
  return pattern;
}

async function getPatternOrThrow(repo: ThreatIntelRepository, id: string): Promise<ThreatPattern> {
  const pattern = await repo.getPatternById(id);
  if (!pattern) {
    throw new ThreatPatternError(`Unknown threat pattern: ${id}`, "pattern_not_found");
  }
  return pattern;
}

export async function verifyThreatPattern(
  repo: ThreatIntelRepository,
  id: string,
  now: Date = new Date(),
): Promise<ThreatPattern> {
  const pattern = await getPatternOrThrow(repo, id);
  const updated = { ...pattern, verifiedByAnalyst: true, updatedAt: now };
  await repo.updatePattern(updated);
  return updated;
}

/** Marking a pattern a false positive also deactivates it -- a confirmed false positive shouldn't keep going out in distribution. */
export async function markThreatPatternFalsePositive(
  repo: ThreatIntelRepository,
  id: string,
  now: Date = new Date(),
): Promise<ThreatPattern> {
  const pattern = await getPatternOrThrow(repo, id);
  const updated = { ...pattern, isFalsePositive: true, isActive: false, updatedAt: now };
  await repo.updatePattern(updated);
  return updated;
}

export async function setThreatPatternActive(
  repo: ThreatIntelRepository,
  id: string,
  isActive: boolean,
  now: Date = new Date(),
): Promise<ThreatPattern> {
  const pattern = await getPatternOrThrow(repo, id);
  const updated = { ...pattern, isActive, updatedAt: now };
  await repo.updatePattern(updated);
  return updated;
}
