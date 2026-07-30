"use client";

const FIELD_LABELS: Record<string, Record<string, string>> = {
  anomaly: {
    minPoints1h: "Minimum data points (last hour)",
    minPoints24h: "Minimum data points (last 24h)",
    baselineMinimum: "Baseline minimum",
    spikeThresholdPct: "Spike threshold (%)",
    severityCriticalPct: "Critical severity threshold (%)",
    severityHighPct: "High severity threshold (%)",
  },
  trend: {
    minPoints7d: "Minimum data points (7 days)",
    minPoints14d: "Minimum data points (14 days)",
    baselineMinimum: "Baseline minimum",
    trendThresholdPct: "Trend threshold (%)",
    severityHighPct: "High severity threshold (%)",
    severityMediumPct: "Medium severity threshold (%)",
  },
  root_cause: {
    minPoints24h: "Minimum data points (24h)",
    dominanceThresholdPct: "Dominance threshold (%)",
    severityCriticalScore: "Critical severity score",
    severityHighScore: "High severity score",
    severityMediumScore: "Medium severity score",
  },
  correlation: {
    minPoints24h: "Minimum data points (24h)",
    avgScoreMinimum: "Average score minimum",
    concentrationThresholdPct: "Concentration threshold (%)",
    severityHighScore: "High severity score",
  },
};

export const FIELDS_BY_DETECTOR_TYPE: Record<string, string[]> = {
  anomaly: ["minPoints1h", "minPoints24h", "baselineMinimum", "spikeThresholdPct", "severityCriticalPct", "severityHighPct"],
  trend: ["minPoints7d", "minPoints14d", "baselineMinimum", "trendThresholdPct", "severityHighPct", "severityMediumPct"],
  root_cause: ["minPoints24h", "dominanceThresholdPct", "severityCriticalScore", "severityHighScore", "severityMediumScore"],
  correlation: ["minPoints24h", "avgScoreMinimum", "concentrationThresholdPct", "severityHighScore"],
};

export function RiskModelParameterFields({
  detectorType,
  values,
  onChange,
}: {
  detectorType: string;
  values: Record<string, number>;
  onChange: (field: string, value: number) => void;
}) {
  const fields = FIELDS_BY_DETECTOR_TYPE[detectorType] ?? [];
  const labels = FIELD_LABELS[detectorType] ?? {};

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field}>
          <label className="block text-xs text-text-muted" htmlFor={field}>
            {labels[field] ?? field}
          </label>
          <input
            id={field}
            type="number"
            step="any"
            value={values[field] ?? ""}
            onChange={(e) => onChange(field, Number(e.target.value))}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
          />
        </div>
      ))}
    </div>
  );
}
