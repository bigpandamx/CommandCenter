import { randomUUID } from "node:crypto";
import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";
import type { InsightSeverity, NetworkRiskInsight, RiskModelParameters } from "./types.js";

/** Every detector's own hardcoded default -- what runs when no RiskModel has been configured for that detector type yet. Extracted here, once, rather than duplicated as inline literals in each function, specifically so riskModelService.ts's own fallback logic and these functions' own defaults can never drift apart from each other. */
export const DEFAULT_SPIKE_PARAMETERS: Extract<RiskModelParameters, { detectorType: "anomaly" }> = {
  detectorType: "anomaly",
  minPoints1h: 2,
  minPoints24h: 5,
  baselineMinimum: 5,
  spikeThresholdPct: 20,
  severityCriticalPct: 50,
  severityHighPct: 30,
};
export const DEFAULT_TREND_PARAMETERS: Extract<RiskModelParameters, { detectorType: "trend" }> = {
  detectorType: "trend",
  minPoints7d: 3,
  minPoints14d: 5,
  baselineMinimum: 5,
  trendThresholdPct: 10,
  severityHighPct: 30,
  severityMediumPct: 15,
};
export const DEFAULT_ROOT_CAUSE_PARAMETERS: Extract<RiskModelParameters, { detectorType: "root_cause" }> = {
  detectorType: "root_cause",
  minPoints24h: 5,
  dominanceThresholdPct: 65,
  severityCriticalScore: 80,
  severityHighScore: 60,
  severityMediumScore: 40,
};
export const DEFAULT_CORRELATION_PARAMETERS: Extract<RiskModelParameters, { detectorType: "correlation" }> = {
  detectorType: "correlation",
  minPoints24h: 10,
  avgScoreMinimum: 50,
  concentrationThresholdPct: 60,
  severityHighScore: 70,
};

/** Scales avgSeverityScore (0-1 here) to Aegis's original 0-100 scale, so every numeric threshold below (baseline minimum 5, severity bands at 80/60/40) matches Aegis's `risk_intelligence_service.py` exactly rather than needing re-derived thresholds for a different scale. */
function riskIndex(a: RiskSignalAggregate): number {
  return a.avgSeverityScore * 100;
}

function avgRiskIndex(aggregates: RiskSignalAggregate[]): number {
  if (aggregates.length === 0) return 0;
  return aggregates.reduce((sum, a) => sum + riskIndex(a), 0) / aggregates.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Which signalType accounts for the most total (noised) signal volume, and its share -- the cross-org analog of Aegis's "dominant risk component." */
function dominantSignalType(aggregates: RiskSignalAggregate[]): { type: string | null; pct: number } {
  const totals = new Map<string, number>();
  let grandTotal = 0;
  for (const a of aggregates) {
    totals.set(a.signalType, (totals.get(a.signalType) ?? 0) + a.signalCount);
    grandTotal += a.signalCount;
  }
  if (totals.size === 0 || grandTotal < 1) return { type: null, pct: 0 };
  let best: string | null = null;
  let bestTotal = -1;
  for (const [type, total] of totals) {
    if (total > bestTotal) {
      best = type;
      bestTotal = total;
    }
  }
  return { type: best, pct: (bestTotal / grandTotal) * 100 };
}

/**
 * Anomaly detector: risk index increased >20% in the last hour vs. the
 * prior-23h baseline. Matches Aegis's `_detect_spike` thresholds exactly:
 * needs >=2 points in the 1h window and >=5 in the 24h window, baseline
 * must be >=5 (on the 0-100 scale) to avoid flagging noise around zero,
 * and severity bands at pctChange >50% (critical) / >30% (high) / else
 * medium.
 */
export function detectSpike(
  industry: string,
  aggregates1h: RiskSignalAggregate[],
  aggregates24h: RiskSignalAggregate[],
  now: Date = new Date(),
  params: Extract<RiskModelParameters, { detectorType: "anomaly" }> = DEFAULT_SPIKE_PARAMETERS,
): NetworkRiskInsight | null {
  if (aggregates1h.length < params.minPoints1h || aggregates24h.length < params.minPoints24h) return null;

  const avg1h = avgRiskIndex(aggregates1h);
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const prior = aggregates24h.filter((a) => a.signalStartTime.getTime() < cutoff.getTime());
  const avgPrior = avgRiskIndex(prior);

  if (avgPrior < params.baselineMinimum || avg1h <= avgPrior) return null;

  const pctChange = ((avg1h - avgPrior) / avgPrior) * 100;
  if (pctChange < params.spikeThresholdPct) return null;

  const { type: dominant, pct: dominantPct } = dominantSignalType(aggregates1h);
  const severity: InsightSeverity =
    pctChange > params.severityCriticalPct ? "critical" : pctChange > params.severityHighPct ? "high" : "medium";
  const compNote = dominant ? ` driven primarily by ${dominant} signals (${dominantPct.toFixed(0)}% of volume)` : "";

  return {
    id: randomUUID(),
    industry,
    type: "anomaly",
    severity,
    summary: `Risk spike: +${pctChange.toFixed(0)}% in the last hour`,
    explanation: `Network risk index for ${industry} jumped from ${avgPrior.toFixed(1)} to ${avg1h.toFixed(1)} (+${pctChange.toFixed(0)}%)${compNote}. This is an unusual acceleration above the 23-hour baseline.`,
    contributingFactors: {
      dominantSignalType: dominant,
      dominantPct: round1(dominantPct),
      avg1h: round1(avg1h),
      avgPrior23h: round1(avgPrior),
      pctChange: round1(pctChange),
    },
    recommendation: dominant
      ? `Investigate recent ${dominant} signals across ${industry} in the last hour.`
      : `Investigate recent risk signals across ${industry} in the last hour.`,
    confidence: 0.85,
    linkedAggregateIds: aggregates1h.slice(0, 10).map((a) => a.id),
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Trend detector: 7-day average risk index changed >10% vs. the
 * previous 7-day period. Matches Aegis's `_analyze_trend`: needs >=3
 * points in the 7d window, >=5 in the 14d window, baseline (previous
 * week's average) must be >=5, severity bands at |pctChange| >30% (high)
 * / >15% (medium) / else low.
 */
export function analyzeTrend(
  industry: string,
  aggregates7d: RiskSignalAggregate[],
  aggregates14d: RiskSignalAggregate[],
  now: Date = new Date(),
  params: Extract<RiskModelParameters, { detectorType: "trend" }> = DEFAULT_TREND_PARAMETERS,
): NetworkRiskInsight | null {
  if (aggregates7d.length < params.minPoints7d || aggregates14d.length < params.minPoints14d) return null;

  const avgThisWeek = avgRiskIndex(aggregates7d);
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeek = aggregates14d.filter((a) => a.signalStartTime.getTime() < cutoff.getTime());
  const avgPrevWeek = avgRiskIndex(prevWeek);

  if (avgPrevWeek < params.baselineMinimum) return null;

  const pctChange = ((avgThisWeek - avgPrevWeek) / avgPrevWeek) * 100;
  if (Math.abs(pctChange) < params.trendThresholdPct) return null;

  const direction = pctChange > 0 ? "increasing" : "decreasing";
  const severity: InsightSeverity =
    Math.abs(pctChange) > params.severityHighPct ? "high" : Math.abs(pctChange) > params.severityMediumPct ? "medium" : "low";
  const { type: dominant } = dominantSignalType(aggregates7d);
  const compNote = dominant ? `, with ${dominant} as the leading signal type` : "";

  return {
    id: randomUUID(),
    industry,
    type: "trend",
    severity,
    summary: `Risk trend ${direction}: ${Math.abs(pctChange).toFixed(0)}% week-over-week across ${industry}`,
    explanation: `Average network risk index for ${industry} changed from ${avgPrevWeek.toFixed(1)} (prev week) to ${avgThisWeek.toFixed(1)} (this week)${compNote}. This is a ${Math.abs(pctChange).toFixed(0)}% ${pctChange > 0 ? "increase" : "decrease"} in the 7-day rolling average.`,
    contributingFactors: {
      dominantSignalType: dominant,
      avgThisWeek: round1(avgThisWeek),
      avgPrevWeek: round1(avgPrevWeek),
      pctChange: round1(pctChange),
      direction,
    },
    recommendation:
      dominant && pctChange > 0
        ? `Monitor ${industry} closely over the next 48 hours, focusing on ${dominant} signals.`
        : `Continue monitoring ${industry} to confirm the trend is sustained.`,
    confidence: 0.8,
    linkedAggregateIds: aggregates7d.slice(0, 10).map((a) => a.id),
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Root cause detector: one signal type accounts for >65% of total signal
 * volume. Matches Aegis's `_find_root_cause` dominance threshold exactly,
 * adapted to use signalCount share instead of Aegis's per-score
 * "contribution" field (Command Center's aggregates don't carry that
 * breakdown -- signalType-share is the closest available analog of "which
 * risk dimension explains this").
 */
export function findRootCause(
  industry: string,
  aggregates24h: RiskSignalAggregate[],
  now: Date = new Date(),
  params: Extract<RiskModelParameters, { detectorType: "root_cause" }> = DEFAULT_ROOT_CAUSE_PARAMETERS,
): NetworkRiskInsight | null {
  if (aggregates24h.length < params.minPoints24h) return null;

  const { type: dominant, pct: dominantPct } = dominantSignalType(aggregates24h);
  if (!dominant || dominantPct < params.dominanceThresholdPct) return null;

  const avgScore = avgRiskIndex(aggregates24h);
  const severity: InsightSeverity =
    avgScore >= params.severityCriticalScore
      ? "critical"
      : avgScore >= params.severityHighScore
        ? "high"
        : avgScore >= params.severityMediumScore
          ? "medium"
          : "low";

  return {
    id: randomUUID(),
    industry,
    type: "root_cause",
    severity,
    summary: `${dominant} dominates risk signal volume at ${dominantPct.toFixed(0)}% in ${industry}`,
    explanation: `${dominant} accounts for ${dominantPct.toFixed(0)}% of total risk signal volume across ${industry} over the last 24 hours. This concentration points to a systemic issue in this specific risk dimension rather than broad-spectrum exposure across the industry.`,
    contributingFactors: {
      dominantSignalType: dominant,
      dominantPct: round1(dominantPct),
      avgRiskIndex: round1(avgScore),
    },
    recommendation: `Investigate ${dominant} specifically across ${industry} -- this may indicate a shared vulnerability, a common misconfiguration pattern, or a coordinated attack targeting this industry.`,
    confidence: 0.88,
    linkedAggregateIds: aggregates24h.slice(0, 10).map((a) => a.id),
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Correlation detector: elevated risk AND signal volume concentrated on
 * a small number of organizations. Matches Aegis's `_detect_correlation`
 * thresholds (avg score >=50, concentration >=60%) exactly, adapted from
 * "concentrated on one model/user" to "concentrated on a few orgs" --
 * the direct cross-org analog, answerable from hashed org identity alone
 * without deanonymizing anyone. Only a truncated hash prefix is exposed
 * in the result (for internal correlation/dedup reference), never a
 * reversible identifier.
 */
export function detectCorrelation(
  industry: string,
  aggregates24h: RiskSignalAggregate[],
  now: Date = new Date(),
  params: Extract<RiskModelParameters, { detectorType: "correlation" }> = DEFAULT_CORRELATION_PARAMETERS,
): NetworkRiskInsight | null {
  if (aggregates24h.length < params.minPoints24h) return null;

  const avgScore = avgRiskIndex(aggregates24h);
  if (avgScore < params.avgScoreMinimum) return null;

  const orgCounts = new Map<string, number>();
  for (const a of aggregates24h) {
    orgCounts.set(a.organizationHash, (orgCounts.get(a.organizationHash) ?? 0) + 1);
  }
  const total = aggregates24h.length;
  let topOrgHash: string | null = null;
  let topCount = 0;
  for (const [hash, count] of orgCounts) {
    if (count > topCount) {
      topOrgHash = hash;
      topCount = count;
    }
  }
  const concentration = (topCount / total) * 100;
  if (concentration < params.concentrationThresholdPct) return null;

  const severity: InsightSeverity = avgScore >= params.severityHighScore ? "high" : "medium";
  const orgLabel = topOrgHash ? `org ${topOrgHash.slice(0, 8)}…` : "an unidentified organization";

  return {
    id: randomUUID(),
    industry,
    type: "correlation",
    severity,
    summary: `${concentration.toFixed(0)}% of elevated risk signals in ${industry} concentrated on one organization`,
    explanation: `${concentration.toFixed(0)}% of elevated risk signals in ${industry} over the last 24h originate from ${orgLabel} (avg risk index ${avgScore.toFixed(1)}, ${orgCounts.size} distinct organizations total). This suggests an organization-specific pattern rather than a broad industry-wide issue.`,
    contributingFactors: {
      topOrganizationHashPrefix: topOrgHash?.slice(0, 8) ?? null,
      concentrationPct: round1(concentration),
      avgRiskIndex: round1(avgScore),
      distinctOrganizations: orgCounts.size,
      totalSignals: total,
    },
    recommendation: `This pattern is concentrated enough to warrant a closer look at whether it's industry-wide risk or an isolated incident at one organization -- consider reaching out if a support relationship already exists.`,
    confidence: 0.75,
    linkedAggregateIds: aggregates24h.slice(0, 10).map((a) => a.id),
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}
