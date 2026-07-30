/**
 * Risk Assessments: see types.ts's own doc comment on RiskAssessment
 * for the full reasoning on why this is a computed snapshot over
 * existing insights, not a new persisted fact the way an Obligation
 * or Control is.
 *
 * The scoring formula, stated plainly rather than buried in code: for
 * every UNRESOLVED insight in an industry, contribute
 * severityWeight(insight.severity) * insight.confidence, then sum
 * across all of them. severityWeight is critical=4, high=3, medium=2,
 * low=1 -- an ordinal scale, not a claim that "critical" is
 * scientifically exactly 4x "low." Confidence weights each
 * contribution by how sure the detector actually was, so a
 * low-confidence critical detection doesn't count as heavily as a
 * high-confidence one. This is a real, adjustable, STATED formula --
 * not a claim of rigorous risk quantification, the same honesty
 * detectors.ts itself already applies to its own thresholds.
 *
 * exposureLevel bands (0 -> low, up to 4 -> medium, up to 10 -> high,
 * above that -> critical) are chosen so that roughly: one typical
 * critical insight alone (~3.4) lands in medium, two or a critical
 * plus supporting issues lands in high, and sustained/multiple severe
 * issues land in critical. Also a stated choice, not derived from
 * anything external -- adjustable the same way the bands in
 * detectors.ts itself were before Risk Models made them configurable.
 *
 * Only UNRESOLVED insights count toward the score -- a resolved
 * insight no longer represents standing exposure, even though it
 * stays in the historical record (contributingInsightIds only ever
 * lists what was unresolved AT THE TIME of that specific snapshot).
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { ExposureLevel, InsightSeverity, NetworkRiskInsight, RiskAssessment } from "./types.js";

const SEVERITY_WEIGHT: Record<InsightSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Pure -- the actual scoring math, fully testable without touching a repository. */
export function computeExposure(unresolvedInsights: NetworkRiskInsight[]): { score: number; level: ExposureLevel } {
  const score = unresolvedInsights.reduce((sum, insight) => sum + SEVERITY_WEIGHT[insight.severity] * insight.confidence, 0);

  let level: ExposureLevel;
  if (score <= 0) level = "low";
  else if (score <= 4) level = "medium";
  else if (score <= 10) level = "high";
  else level = "critical";

  return { score: Math.round(score * 100) / 100, level };
}

/** One industry's snapshot -- fetches its currently-unresolved insights, scores them, persists the result. */
export async function generateRiskAssessmentSnapshot(
  repo: RiskIntelligenceRepository,
  industry: string,
  now: Date = new Date(),
): Promise<RiskAssessment> {
  const unresolved = await repo.searchInsights({ industry, isResolved: false });
  const { score, level } = computeExposure(unresolved);

  const assessment: RiskAssessment = {
    id: randomUUID(),
    industry,
    assessedAt: now,
    exposureScore: score,
    exposureLevel: level,
    contributingInsightIds: unresolved.map((i) => i.id),
  };
  await repo.createRiskAssessment(assessment);
  return assessment;
}

/**
 * Every industry that's ever had an insight gets a fresh snapshot --
 * what the scheduled job (see Jobs' own registry) actually runs. One
 * industry's failure doesn't stop the rest -- same resilience pattern
 * used everywhere else a batch of independent items gets processed in
 * this codebase.
 */
export async function generateRiskAssessmentSnapshotsForAllIndustries(
  repo: RiskIntelligenceRepository,
  now: Date = new Date(),
): Promise<{ industry: string; status: "success" | "error"; error: string | null }[]> {
  const industries = await repo.listIndustriesWithInsights();
  const results: { industry: string; status: "success" | "error"; error: string | null }[] = [];
  for (const industry of industries) {
    try {
      await generateRiskAssessmentSnapshot(repo, industry, now);
      results.push({ industry, status: "success", error: null });
    } catch (err) {
      results.push({ industry, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function listRiskAssessmentHistory(
  repo: RiskIntelligenceRepository,
  industry: string,
  opts?: { limit?: number },
): Promise<RiskAssessment[]> {
  return repo.listRiskAssessmentsForIndustry(industry, opts);
}

export async function getLatestRiskAssessment(repo: RiskIntelligenceRepository, industry: string): Promise<RiskAssessment | null> {
  return repo.getLatestRiskAssessmentForIndustry(industry);
}
