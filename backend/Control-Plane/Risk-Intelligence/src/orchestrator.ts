import type { RiskIntelligenceRepository } from "./repository.js";
import { detectSpike, analyzeTrend, findRootCause, detectCorrelation } from "./detectors.js";
import { resolveActiveModelParameters } from "./riskModelService.js";
import type { InsightSearchQuery, NetworkRiskInsight } from "./types.js";

const DEDUP_WINDOW_MINUTES = 60;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class RiskIntelligenceError extends Error {
  constructor(
    message: string,
    public readonly code: "insight_not_found",
  ) {
    super(message);
    this.name = "RiskIntelligenceError";
  }
}

/**
 * Runs all four detectors for an industry and persists whichever produce
 * a result, skipping any detector type already generated in the last 60
 * minutes -- same dedup window as Aegis's `generate_insights`. Returns
 * only the newly-created insights (not previously-existing ones still
 * within their dedup window).
 */
export async function generateNetworkRiskInsights(
  repo: RiskIntelligenceRepository,
  industry: string,
  now: Date = new Date(),
): Promise<NetworkRiskInsight[]> {
  const [aggregates1h, aggregates24h, aggregates7d, aggregates14d] = await Promise.all([
    repo.listAggregatesInWindow(industry, new Date(now.getTime() - HOUR_MS), now),
    repo.listAggregatesInWindow(industry, new Date(now.getTime() - DAY_MS), now),
    repo.listAggregatesInWindow(industry, new Date(now.getTime() - 7 * DAY_MS), now),
    repo.listAggregatesInWindow(industry, new Date(now.getTime() - 14 * DAY_MS), now),
  ]);

  const existingTypes = await repo.recentInsightTypes(industry, DEDUP_WINDOW_MINUTES, now);
  const generated: NetworkRiskInsight[] = [];

  if (!existingTypes.has("anomaly")) {
    const params = await resolveActiveModelParameters(repo, "anomaly");
    if (params.detectorType === "anomaly") {
      const insight = detectSpike(industry, aggregates1h, aggregates24h, now, params);
      if (insight) generated.push(insight);
    }
  }
  if (!existingTypes.has("trend")) {
    const params = await resolveActiveModelParameters(repo, "trend");
    if (params.detectorType === "trend") {
      const insight = analyzeTrend(industry, aggregates7d, aggregates14d, now, params);
      if (insight) generated.push(insight);
    }
  }
  if (!existingTypes.has("root_cause")) {
    const params = await resolveActiveModelParameters(repo, "root_cause");
    if (params.detectorType === "root_cause") {
      const insight = findRootCause(industry, aggregates24h, now, params);
      if (insight) generated.push(insight);
    }
  }
  if (!existingTypes.has("correlation")) {
    const params = await resolveActiveModelParameters(repo, "correlation");
    if (params.detectorType === "correlation") {
      const insight = detectCorrelation(industry, aggregates24h, now, params);
      if (insight) generated.push(insight);
    }
  }

  for (const insight of generated) {
    await repo.createInsight(insight);
  }

  return generated;
}

export async function listNetworkRiskInsights(
  repo: RiskIntelligenceRepository,
  query: InsightSearchQuery,
): Promise<NetworkRiskInsight[]> {
  return repo.searchInsights(query);
}

export async function resolveNetworkRiskInsight(
  repo: RiskIntelligenceRepository,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const insight = await repo.getInsightById(id);
  if (!insight) {
    throw new RiskIntelligenceError(`Unknown insight: ${id}`, "insight_not_found");
  }
  await repo.resolveInsight(id, now);
}
