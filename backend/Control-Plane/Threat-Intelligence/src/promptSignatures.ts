import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { CreatePromptAbuseSignatureInput, PromptAbuseSignature } from "./types.js";

export class SignatureError extends Error {
  constructor(
    message: string,
    public readonly code: "signature_not_found" | "invalid_input" | "duplicate_signature_id",
  ) {
    super(message);
    this.name = "SignatureError";
  }
}

const DEFAULT_MATCH_THRESHOLD = 0.85;

function assertUnitInterval(value: number, fieldName: string): void {
  if (value < 0 || value > 1) {
    throw new SignatureError(`${fieldName} must be between 0.0 and 1.0, got ${value}`, "invalid_input");
  }
}

export async function createPromptAbuseSignature(
  repo: ThreatIntelRepository,
  input: CreatePromptAbuseSignatureInput,
  now: Date = new Date(),
): Promise<PromptAbuseSignature> {
  if (!input.signatureId.trim()) {
    throw new SignatureError("signatureId is required", "invalid_input");
  }
  if (!input.signatureName.trim() || !input.category.trim()) {
    throw new SignatureError("signatureName and category are required", "invalid_input");
  }

  const matchThreshold = input.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  assertUnitInterval(matchThreshold, "matchThreshold");
  assertUnitInterval(input.riskScore, "riskScore");

  const existing = await repo.getSignatureBySignatureId(input.signatureId);
  if (existing) {
    throw new SignatureError(`signatureId "${input.signatureId}" already exists`, "duplicate_signature_id");
  }

  const signature: PromptAbuseSignature = {
    id: randomUUID(),
    signatureId: input.signatureId.trim(),
    signatureName: input.signatureName.trim(),
    category: input.category.trim(),
    patternRegex: input.patternRegex ?? null,
    patternKeywords: input.patternKeywords ?? null,
    detectionLogic: input.detectionLogic,
    matchThreshold,
    discoveredFromOrgCount: 0,
    totalDetections: 0,
    falsePositiveRate: null,
    severity: input.severity,
    riskScore: input.riskScore,
    examplePrompts: input.examplePrompts ?? null,
    isActive: true,
    isExperimental: input.isExperimental ?? false,
    relatedThreatPatternId: input.relatedThreatPatternId ?? null,
    createdAt: now,
    updatedAt: now,
    lastDetection: null,
  };

  await repo.createSignature(signature);
  return signature;
}

async function getSignatureOrThrow(repo: ThreatIntelRepository, id: string): Promise<PromptAbuseSignature> {
  const signature = await repo.getSignatureById(id);
  if (!signature) {
    throw new SignatureError(`Unknown signature: ${id}`, "signature_not_found");
  }
  return signature;
}

export async function setSignatureActive(
  repo: ThreatIntelRepository,
  id: string,
  isActive: boolean,
  now: Date = new Date(),
): Promise<PromptAbuseSignature> {
  const signature = await getSignatureOrThrow(repo, id);
  const updated = { ...signature, isActive, updatedAt: now };
  await repo.updateSignature(updated);
  return updated;
}

/** Promotes a signature out of experimental status -- e.g. once it's proven low false-positive rate in the field. */
export async function graduateSignature(
  repo: ThreatIntelRepository,
  id: string,
  now: Date = new Date(),
): Promise<PromptAbuseSignature> {
  const signature = await getSignatureOrThrow(repo, id);
  const updated = { ...signature, isExperimental: false, updatedAt: now };
  await repo.updateSignature(updated);
  return updated;
}
