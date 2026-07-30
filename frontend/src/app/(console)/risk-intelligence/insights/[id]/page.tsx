import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { getInsight, listRiskFactors, listRiskFactorsForInsight, listTreatmentsForInsight, AdminApiError } from "../../../../../lib/adminApiClient";
import { ResolveInsightButton } from "../../../../../components/ResolveInsightButton";
import { ClassifyInsightControl } from "../../../../../components/ClassifyInsightControl";
import { ProposeTreatmentForm } from "../../../../../components/ProposeTreatmentForm";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

const TREATMENT_TYPE_LABEL: Record<string, string> = {
  avoid: "Avoid",
  mitigate: "Mitigate",
  transfer: "Transfer",
  accept: "Accept",
};

const TREATMENT_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  in_progress: "In progress",
  completed: "Completed",
};

export default async function InsightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await requireSession();

  let insight;
  try {
    insight = await getInsight(config, id);
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const [{ riskFactors: linkedFactors }, { riskFactors: allFactors }, { treatments }] = await Promise.all([
    listRiskFactorsForInsight(config, id),
    listRiskFactors(config),
    listTreatmentsForInsight(config, id),
  ]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Insight</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[insight.severity]}`}>{insight.severity}</span>
            <span className="text-xs text-text-muted">{insight.type}</span>
            <span className="text-xs text-text-muted">{insight.industry}</span>
          </div>
          <h1 className="mt-1 text-lg font-semibold text-text-primary">{insight.summary}</h1>
        </div>
        {!insight.isResolved && <ResolveInsightButton insightId={insight.id} />}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Explanation</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-text-primary">{insight.explanation}</p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recommendation</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-text-primary">{insight.recommendation}</p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Risk factors</h2>
            <div className="mt-2">
              <ClassifyInsightControl insightId={insight.id} linkedFactors={linkedFactors} availableFactors={allFactors} />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Treatments</h2>
            {treatments.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">No treatment proposed yet -- an ordinary state, not a gap.</p>
            ) : (
              <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                {treatments.map((t) => (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-primary">
                        {TREATMENT_TYPE_LABEL[t.treatmentType] ?? t.treatmentType}
                      </span>
                      <span className="text-xs text-text-muted">{TREATMENT_STATUS_LABEL[t.status] ?? t.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-text-primary">{t.description}</p>
                  </div>
                ))}
              </div>
            )}
            <ProposeTreatmentForm insightId={insight.id} />
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Details</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Confidence</dt>
                <dd className="text-text-primary">{Math.round(insight.confidence * 100)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Detected</dt>
                <dd className="text-text-primary">{new Date(insight.createdAt).toLocaleString()}</dd>
              </div>
              {insight.resolvedAt && (
                <div>
                  <dt className="text-xs text-text-muted">Resolved</dt>
                  <dd className="text-text-primary">{new Date(insight.resolvedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>

          {Object.keys(insight.contributingFactors).length > 0 && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Contributing factors</h2>
              <dl className="mt-2 space-y-1.5 text-xs">
                {Object.entries(insight.contributingFactors).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="text-text-muted">{key}</dt>
                    <dd className="text-right text-text-primary">{formatFactorValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFactorValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
