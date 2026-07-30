import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listRiskModels } from "../../../../lib/adminApiClient";

const DETECTOR_TYPE_LABEL: Record<string, string> = {
  anomaly: "Anomaly",
  trend: "Trend",
  root_cause: "Root cause",
  correlation: "Correlation",
};

export default async function RiskModelsPage() {
  const config = await requireSession();
  const { riskModels } = await listRiskModels(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
          <h1 className="text-lg font-semibold text-text-primary">Risk Models</h1>
          <p className="mt-1 text-sm text-text-muted">
            The detection thresholds each detector actually uses -- extracted from what was previously hardcoded, so
            they can be retuned without a code change. When no model is active for a detector type, the detector
            falls back to its own built-in default, exactly as it always has.
          </p>
        </div>
        <Link
          href="/risk-intelligence/risk-models/new"
          className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500"
        >
          New risk model
        </Link>
      </div>

      {riskModels.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No risk models configured yet -- every detector is using its own built-in default.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {riskModels.map((model) => (
            <Link
              key={model.key}
              href={`/risk-intelligence/risk-models/${model.key}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-raised"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-primary">
                    {DETECTOR_TYPE_LABEL[model.parameters.detectorType] ?? model.parameters.detectorType}
                  </span>
                  {model.isActive && <span className="text-xs text-text-primary">Active</span>}
                </div>
                <p className="mt-1 text-sm text-text-primary">{model.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{model.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
