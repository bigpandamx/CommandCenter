import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { RiskSignalAggregate } from "./riskSignals.js";

/**
 * Sector-specific risk percentile rankings, computed periodically from
 * aggregated risk signals. Matches Aegis's `calculate_industry_benchmarks`
 * formula-for-formula, including the numpy-equivalent percentile method
 * (see percentileLinear below) and the k-anonymity floor: fewer than 10
 * distinct organizations contributing data means no benchmark is
 * returned at all, full stop -- this is the actual privacy protection
 * this feature exists to provide, not a cosmetic threshold.
 */

export type BenchmarkMetric = "risk_score" | "deployment_failure_rate" | "policy_violation_rate";

export interface IndustryBenchmark {
  id: string;
  industry: string;
  metric: BenchmarkMetric;
  /** e.g. "2026-Q3" -- matches Aegis's quarter-string format exactly. */
  benchmarkPeriod: string;
  percentile10: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile90: number;
  meanValue: number;
  stdDeviation: number;
  sampleSize: number;
  totalDataPoints: number;
  minValue: number;
  maxValue: number;
  confidenceScore: number;
  dataQualityScore: number;
  calculatedAt: Date;
  validUntil: Date;
}

const MIN_SAMPLE_SIZE = 10; // k-anonymity floor -- matches Aegis's CheckConstraint(sample_size >= 10)
const CONFIDENCE_FULL_AT_ORG_COUNT = 50;
const VALID_FOR_DAYS = 90;

/**
 * numpy's default `np.percentile` behavior (linear interpolation
 * between closest ranks) on an already-sorted array. Reimplemented here
 * rather than approximated, since this needs to produce the same
 * numbers Aegis's Python implementation would for the same input --
 * these are customer-facing percentile rankings, not internal
 * estimates, so "close enough" isn't good enough.
 */
function percentileLinear(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 1) return sortedValues[0] as number;
  const rank = (percentile / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const fraction = rank - lowerIndex;
  const lower = sortedValues[lowerIndex] as number;
  const upper = sortedValues[upperIndex] as number;
  return lower + fraction * (upper - lower);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation (ddof=0) -- matches numpy's np.std default, not the sample stddev (ddof=1) some other tools default to. */
function populationStdDev(values: number[], meanValue: number): number {
  const variance = values.reduce((sum, v) => sum + (v - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function extractMetricValue(signal: RiskSignalAggregate, metric: BenchmarkMetric): number | null {
  switch (metric) {
    case "risk_score":
      return signal.avgSeverityScore;
    case "deployment_failure_rate":
      if (signal.totalDeploymentsCount <= 0) return null;
      return Math.min(1, signal.signalCount / signal.totalDeploymentsCount);
    case "policy_violation_rate":
      if (signal.signalType !== "policy_violation" || signal.totalDeploymentsCount <= 0) return null;
      return Math.min(1, signal.signalCount / signal.totalDeploymentsCount);
  }
}

function currentQuarterLabel(now: Date): string {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
}

/**
 * Returns null when there isn't enough data for a privacy-safe benchmark
 * -- this is a legitimate, expected outcome for a new or niche industry
 * segment, not an error condition.
 */
export async function calculateIndustryBenchmark(
  repo: ThreatIntelRepository,
  industry: string,
  metric: BenchmarkMetric,
  timeWindowDays = 30,
  now: Date = new Date(),
): Promise<IndustryBenchmark | null> {
  const since = new Date(now.getTime() - timeWindowDays * 24 * 60 * 60 * 1000);
  const signals = await repo.listRiskSignalAggregates(industry, since);

  if (signals.length < MIN_SAMPLE_SIZE) return null;

  const values: number[] = [];
  const orgHashes = new Set<string>();
  for (const signal of signals) {
    orgHashes.add(signal.organizationHash);
    const value = extractMetricValue(signal, metric);
    if (value !== null) values.push(value);
  }

  if (values.length < MIN_SAMPLE_SIZE || orgHashes.size < MIN_SAMPLE_SIZE) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const meanValue = mean(values);
  const sampleSize = orgHashes.size;

  const benchmark: IndustryBenchmark = {
    id: randomUUID(),
    industry,
    metric,
    benchmarkPeriod: currentQuarterLabel(now),
    percentile10: percentileLinear(sorted, 10),
    percentile25: percentileLinear(sorted, 25),
    percentile50: percentileLinear(sorted, 50),
    percentile75: percentileLinear(sorted, 75),
    percentile90: percentileLinear(sorted, 90),
    meanValue,
    stdDeviation: populationStdDev(values, meanValue),
    sampleSize,
    totalDataPoints: values.length,
    minValue: sorted[0] as number,
    maxValue: sorted[sorted.length - 1] as number,
    confidenceScore: Math.min(1, sampleSize / CONFIDENCE_FULL_AT_ORG_COUNT),
    dataQualityScore: Math.min(1, values.length / (sampleSize * 10)),
    calculatedAt: now,
    validUntil: new Date(now.getTime() + VALID_FOR_DAYS * 24 * 60 * 60 * 1000),
  };

  await repo.upsertIndustryBenchmark(benchmark);
  return benchmark;
}

export async function getIndustryBenchmark(
  repo: ThreatIntelRepository,
  industry: string,
  metric: BenchmarkMetric,
  benchmarkPeriod: string,
): Promise<IndustryBenchmark | null> {
  return repo.getIndustryBenchmark(industry, metric, benchmarkPeriod);
}

/** All currently-valid (not-yet-expired) benchmarks, optionally filtered to one industry -- mirrors Aegis's get_all_industry_benchmarks. */
export async function listAllIndustryBenchmarks(
  repo: ThreatIntelRepository,
  options: { industry?: string; limit?: number } = {},
  now: Date = new Date(),
): Promise<IndustryBenchmark[]> {
  return repo.listBenchmarks(options.industry, options.limit ?? 50, now);
}
