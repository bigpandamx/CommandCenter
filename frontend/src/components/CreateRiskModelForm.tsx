"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiskModelParameterFields, FIELDS_BY_DETECTOR_TYPE } from "./RiskModelParameterFields";

const DETECTOR_TYPES = [
  { value: "anomaly", label: "Anomaly (spike detection)" },
  { value: "trend", label: "Trend" },
  { value: "root_cause", label: "Root cause" },
  { value: "correlation", label: "Correlation" },
] as const;

// The same numbers detectors.ts itself already defaults to -- a starting point staff
// can retune, not a blank form. See that file's own DEFAULT_*_PARAMETERS constants.
const DEFAULTS_BY_TYPE: Record<string, Record<string, number>> = {
  anomaly: { minPoints1h: 2, minPoints24h: 5, baselineMinimum: 5, spikeThresholdPct: 20, severityCriticalPct: 50, severityHighPct: 30 },
  trend: { minPoints7d: 3, minPoints14d: 5, baselineMinimum: 5, trendThresholdPct: 10, severityHighPct: 30, severityMediumPct: 15 },
  root_cause: { minPoints24h: 5, dominanceThresholdPct: 65, severityCriticalScore: 80, severityHighScore: 60, severityMediumScore: 40 },
  correlation: { minPoints24h: 10, avgScoreMinimum: 50, concentrationThresholdPct: 60, severityHighScore: 70 },
};

export function CreateRiskModelForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [detectorType, setDetectorType] = useState<(typeof DETECTOR_TYPES)[number]["value"]>("anomaly");
  const [values, setValues] = useState<Record<string, number>>(DEFAULTS_BY_TYPE.anomaly!);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDetectorTypeChange(next: (typeof DETECTOR_TYPES)[number]["value"]) {
    setDetectorType(next);
    setValues(DEFAULTS_BY_TYPE[next]!);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/risk-intelligence/risk-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name,
          description,
          parameters: { detectorType, ...values },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? body.error ?? "Couldn't create that risk model.");
        return;
      }
      router.push(`/risk-intelligence/risk-models/${encodeURIComponent(body.key)}`);
    } finally {
      setPending(false);
    }
  }

  const allFilled = FIELDS_BY_DETECTOR_TYPE[detectorType]?.every((f) => Number.isFinite(values[f])) ?? false;

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="detectorType">
          Detector type
        </label>
        <select
          id="detectorType"
          value={detectorType}
          onChange={(e) => handleDetectorTypeChange(e.target.value as (typeof DETECTOR_TYPES)[number]["value"])}
          className="mt-1 rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          {DETECTOR_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          Which detector this model configures -- can&apos;t be changed after creation. Retune the numbers instead
          of recreating the model, or create a new one for a different detector type.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="key">
          Key
        </label>
        <input
          id="key"
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sensitive-anomaly-detection"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sensitive Anomaly Detection"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What makes this configuration different from the default…"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-text-primary">Parameters</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Pre-filled with the same defaults the detector itself already uses -- retune from here.
        </p>
        <div className="mt-2">
          <RiskModelParameterFields
            detectorType={detectorType}
            values={values}
            onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || !key.trim() || !name.trim() || !description.trim() || !allFilled}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create risk model"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
