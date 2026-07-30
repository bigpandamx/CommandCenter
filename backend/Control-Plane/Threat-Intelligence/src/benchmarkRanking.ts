import type { ThreatIntelRepository } from "./repository.js";
import type { BenchmarkMetric, IndustryBenchmark } from "./benchmarks.js";

/**
 * Compares one organization's own metric value against the industry
 * benchmark distribution, mirroring Aegis's
 * `get_organization_benchmark_ranking` -- this is the actual customer-
 * facing payoff of benchmarking ("you're in the 82nd percentile"), which
 * `calculateIndustryBenchmark` alone doesn't provide; that function only
 * computes the distribution, not where any particular org falls in it.
 * Missing this was a real gap: the distribution existed, but nothing
 * used it to answer the question a customer actually asks.
 */

export type PerformanceTier = "excellent" | "good" | "below_average" | "poor";

export interface BenchmarkRanking {
  industry: string;
  metric: BenchmarkMetric;
  yourValue: number;
  percentileRank: number;
  performance: PerformanceTier;
  message: string;
  median: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  sampleSize: number;
  benchmarkPeriod: string;
  /** Whether this org itself has consented to shareBenchmarkData -- false doesn't block viewing the ranking, it just means their own data isn't part of what's being compared against, same as Aegis's version. */
  contributing: boolean;
  confidence: number;
  /** True when no real benchmark exists yet and industry-typical defaults were used instead, so the response is still useful rather than a 404 -- matches Aegis's synthetic-fallback behavior. Callers should treat a synthetic ranking as illustrative, not authoritative. */
  synthetic: boolean;
}

/**
 * Industry-typical default percentiles, used only when no real
 * benchmark has been calculated yet for the current period. Ported
 * directly from Aegis's `_defaults` dict -- reasonable placeholder
 * values, not derived from real Command Center data (there isn't any
 * yet for a metric with no benchmark). Only the 3 metrics this module
 * actually computes (see benchmarks.ts) have real defaults here; the
 * other 5 metrics in Aegis's original BenchmarkMetric enum
 * (mean_time_to_detect, mean_time_to_remediate, compliance_score,
 * audit_coverage, model_reliability) aren't computable from Command
 * Center's current RiskSignalAggregate data model at all -- see
 * CUTOVER.md for why those were left out rather than faked.
 */
const SYNTHETIC_DEFAULTS: Record<BenchmarkMetric, [number, number, number, number, number]> = {
  risk_score: [0.3, 0.45, 0.6, 0.75, 0.85],
  deployment_failure_rate: [0.02, 0.05, 0.1, 0.18, 0.25],
  policy_violation_rate: [0.01, 0.03, 0.07, 0.12, 0.2],
};

/** Metrics where a lower value is better -- percentile comparison direction inverts for these, matching Aegis exactly. */
const INVERSE_METRICS: ReadonlySet<BenchmarkMetric> = new Set(["deployment_failure_rate", "policy_violation_rate"]);

function currentQuarterLabel(now: Date): string {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
}

function percentileRankFor(yourValue: number, benchmark: IndustryBenchmark, isInverse: boolean): number {
  const { percentile10, percentile25, percentile50, percentile75, percentile90 } = benchmark;
  if (isInverse) {
    if (yourValue <= percentile10) return 90;
    if (yourValue <= percentile25) return 75;
    if (yourValue <= percentile50) return 50;
    if (yourValue <= percentile75) return 25;
    if (yourValue <= percentile90) return 10;
    return 5;
  }
  if (yourValue >= percentile90) return 90;
  if (yourValue >= percentile75) return 75;
  if (yourValue >= percentile50) return 50;
  if (yourValue >= percentile25) return 25;
  if (yourValue >= percentile10) return 10;
  return 5;
}

function performanceFor(percentileRank: number): PerformanceTier {
  if (percentileRank >= 75) return "excellent";
  if (percentileRank >= 50) return "good";
  if (percentileRank >= 25) return "below_average";
  return "poor";
}

export async function getOrganizationBenchmarkRanking(
  repo: ThreatIntelRepository,
  organizationId: string,
  industry: string,
  metric: BenchmarkMetric,
  yourValue: number,
  now: Date = new Date(),
): Promise<BenchmarkRanking> {
  const consent = await repo.getConsent(organizationId);
  const contributing = Boolean(consent?.shareBenchmarkData && !consent.revokedAt);

  const benchmarkPeriod = currentQuarterLabel(now);
  let benchmark = await repo.getIndustryBenchmark(industry, metric, benchmarkPeriod);
  let synthetic = false;

  if (!benchmark) {
    synthetic = true;
    const [p10, p25, p50, p75, p90] = SYNTHETIC_DEFAULTS[metric];
    benchmark = {
      id: "synthetic",
      industry,
      metric,
      benchmarkPeriod,
      percentile10: p10,
      percentile25: p25,
      percentile50: p50,
      percentile75: p75,
      percentile90: p90,
      meanValue: p50,
      stdDeviation: 0,
      sampleSize: 0,
      totalDataPoints: 0,
      minValue: p10,
      maxValue: p90,
      confidenceScore: 0,
      dataQualityScore: 0,
      calculatedAt: now,
      validUntil: now,
    };
  }

  const isInverse = INVERSE_METRICS.has(metric);
  const percentileRank = percentileRankFor(yourValue, benchmark, isInverse);
  const performance = performanceFor(percentileRank);

  const message =
    performance === "excellent"
      ? `Your ${metric} is better than ${percentileRank}% of organizations in your industry`
      : performance === "good"
        ? `Your ${metric} is above average (better than ${percentileRank}% of peers)`
        : performance === "below_average"
          ? `Your ${metric} needs improvement (better than only ${percentileRank}% of peers)`
          : `Your ${metric} is significantly below industry standards`;

  return {
    industry,
    metric,
    yourValue,
    percentileRank,
    performance,
    message,
    median: benchmark.percentile50,
    percentile25: benchmark.percentile25,
    percentile75: benchmark.percentile75,
    percentile90: benchmark.percentile90,
    sampleSize: benchmark.sampleSize,
    benchmarkPeriod,
    contributing,
    confidence: benchmark.confidenceScore,
    synthetic,
  };
}
