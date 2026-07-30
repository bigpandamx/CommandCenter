import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { getRiskFactor, getRiskFactorSummary, listPlaybooksForRiskFactor, listInsightsForRiskFactor, AdminApiError } from "../../../../../lib/adminApiClient";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

export default async function RiskFactorDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();

  let factor;
  try {
    factor = await getRiskFactor(config, key);
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const [summary, { playbooks }, { insights }] = await Promise.all([
    getRiskFactorSummary(config, key),
    listPlaybooksForRiskFactor(config, key),
    listInsightsForRiskFactor(config, key),
  ]);

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Risk Factors</p>
      <h1 className="text-lg font-semibold text-text-primary">{factor.name}</h1>
      <p className="mt-1 text-sm text-text-muted">{factor.description}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">Linked insights</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{summary.totalLinkedInsights}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">Unresolved</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{summary.unresolvedLinkedInsights}</p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Playbooks for this risk</h2>
        {playbooks.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No playbook linked yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {playbooks.map((p) => (
              <div key={p.key} className="px-4 py-3">
                <p className="text-sm text-text-primary">{p.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {p.steps.length} step{p.steps.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Classified insights</h2>
        {insights.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nothing classified under this factor yet -- an ordinary, unremarkable state, not a gap.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {insights.map((insight) => (
              <Link
                key={insight.id}
                href={`/risk-intelligence/insights/${insight.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-raised"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[insight.severity]}`}>{insight.severity}</span>
                  <span className="text-sm text-text-primary">{insight.summary}</span>
                  {insight.isResolved && <span className="text-xs text-text-muted">· resolved</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
