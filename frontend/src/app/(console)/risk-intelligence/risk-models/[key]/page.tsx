import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { getRiskModel, AdminApiError } from "../../../../../lib/adminApiClient";
import { EditRiskModelForm } from "../../../../../components/EditRiskModelForm";

const DETECTOR_TYPE_LABEL: Record<string, string> = {
  anomaly: "Anomaly",
  trend: "Trend",
  root_cause: "Root cause",
  correlation: "Correlation",
};

export default async function RiskModelDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();

  let model;
  try {
    model = await getRiskModel(config, key);
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const { detectorType, ...values } = model.parameters as Record<string, unknown> & { detectorType: string };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-primary">
          {DETECTOR_TYPE_LABEL[detectorType] ?? detectorType}
        </span>
        {model.isActive && <span className="text-xs text-text-primary">Active</span>}
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Risk Models</p>
      <h1 className="text-lg font-semibold text-text-primary">{model.name}</h1>
      <p className="mt-1 text-sm text-text-muted">{model.description}</p>

      <div className="mt-6 max-w-2xl rounded-lg border border-border bg-surface p-4">
        <EditRiskModelForm
          modelKey={model.key}
          detectorType={detectorType}
          initialValues={values as Record<string, number>}
          initialIsActive={model.isActive}
        />
      </div>
    </div>
  );
}
