/**
 * Risk Factors: see types.ts's own doc comment on RiskFactor for the
 * full reasoning on why this is a classification taxonomy, not a
 * requirement hierarchy, and why it deliberately doesn't touch
 * Controls or Frameworks at all.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { NetworkRiskInsight, RiskFactor, RiskFactorSummary } from "./types.js";

export class RiskFactorError extends Error {
  constructor(
    message: string,
    public readonly code: "risk_factor_not_found" | "duplicate_key" | "invalid_key" | "insight_not_found",
  ) {
    super(message);
    this.name = "RiskFactorError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createRiskFactor(
  repo: RiskIntelligenceRepository,
  input: { key: string; name: string; description: string },
  now: Date = new Date(),
): Promise<RiskFactor> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new RiskFactorError(
      `Invalid risk factor key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai-model-risk")`,
      "invalid_key",
    );
  }
  const existing = await repo.getRiskFactorByKey(input.key);
  if (existing) {
    throw new RiskFactorError(`A risk factor with key "${input.key}" already exists`, "duplicate_key");
  }

  const factor: RiskFactor = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createRiskFactor(factor);
  return factor;
}

export async function listRiskFactors(repo: RiskIntelligenceRepository, opts?: { limit?: number }): Promise<RiskFactor[]> {
  return repo.listRiskFactors(opts);
}

async function requireRiskFactorByKey(repo: RiskIntelligenceRepository, key: string): Promise<RiskFactor> {
  const factor = await repo.getRiskFactorByKey(key);
  if (!factor) {
    throw new RiskFactorError(`No risk factor with key "${key}"`, "risk_factor_not_found");
  }
  return factor;
}

async function requireInsightById(repo: RiskIntelligenceRepository, id: string): Promise<NetworkRiskInsight> {
  const insight = await repo.getInsightById(id);
  if (!insight) {
    throw new RiskFactorError(`No insight with id "${id}"`, "insight_not_found");
  }
  return insight;
}

/** Staff classifying an insight under a risk dimension -- an explicit, human judgment call, not an automatic classifier. See types.ts's own doc comment for why that's deliberate. */
export async function classifyInsight(repo: RiskIntelligenceRepository, insightId: string, riskFactorKey: string): Promise<void> {
  const insight = await requireInsightById(repo, insightId);
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  await repo.linkInsightToRiskFactor(insight.id, factor.id);
}

export async function declassifyInsight(repo: RiskIntelligenceRepository, insightId: string, riskFactorKey: string): Promise<void> {
  const insight = await requireInsightById(repo, insightId);
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  await repo.unlinkInsightFromRiskFactor(insight.id, factor.id);
}

export async function listRiskFactorsForInsight(repo: RiskIntelligenceRepository, insightId: string): Promise<RiskFactor[]> {
  await requireInsightById(repo, insightId);
  return repo.listRiskFactorsForInsight(insightId);
}

/**
 * Prevalence and current exposure under this dimension -- NOT a
 * completeness stat the way ComplianceFramework's own coverage is. A
 * risk factor with zero linked insights isn't a gap the way an
 * unmapped required control is; it just means nothing's been
 * classified under it yet, or genuinely nothing's happening in that
 * dimension right now. Both are unremarkable, ordinary states.
 */
export async function computeRiskFactorSummary(repo: RiskIntelligenceRepository, riskFactorKey: string): Promise<RiskFactorSummary> {
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  const insights = await repo.listInsightsForRiskFactor(factor.id);

  return {
    riskFactorId: factor.id,
    riskFactorKey: factor.key,
    riskFactorName: factor.name,
    totalLinkedInsights: insights.length,
    unresolvedLinkedInsights: insights.filter((i) => !i.isResolved).length,
  };
}

/** The full insight records classified under this risk factor -- what a factor's own detail view needs to actually show which insights it covers, not just the summary counts. */
export async function listInsightsClassifiedUnderRiskFactor(repo: RiskIntelligenceRepository, riskFactorKey: string): Promise<NetworkRiskInsight[]> {
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  return repo.listInsightsForRiskFactor(factor.id);
}
