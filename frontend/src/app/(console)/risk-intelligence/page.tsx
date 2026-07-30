import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { listInsights, listRiskFactors, listRiskModels, listPlaybooks, listOutages } from "../../../lib/adminApiClient";

export default async function RiskIntelligencePage() {
  const config = await requireSession();
  const [{ insights: unresolvedInsights }, { riskFactors }, { riskModels }, { playbooks }, { outages }] = await Promise.all([
    listInsights(config, { isResolved: false, limit: 200 }),
    listRiskFactors(config),
    listRiskModels(config),
    listPlaybooks(config),
    listOutages(config, { isResolved: false }),
  ]);
  const criticalCount = unresolvedInsights.filter((i) => i.severity === "critical").length;
  const activeModelCount = riskModels.filter((m) => m.isActive).length;

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
      <h1 className="text-lg font-semibold text-text-primary">Overview</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Detections computed from cross-org signal patterns, plus significant external events -- CVEs, MITRE ATT&amp;CK
        campaigns, approaching compliance deadlines, and reported provider outages. Classified by risk factor,
        addressed with treatments, and where a playbook exists, a known procedure to follow.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/risk-intelligence/insights" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Insights</p>
          <p className="mt-1 text-sm text-text-muted">
            {criticalCount} unresolved critical insight{criticalCount === 1 ? "" : "s"} right now.
          </p>
        </Link>
        <Link href="/risk-intelligence/risk-factors" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Risk Factors</p>
          <p className="mt-1 text-sm text-text-muted">
            {riskFactors.length} defined risk factor{riskFactors.length === 1 ? "" : "s"} classifying detected insights.
          </p>
        </Link>
        <Link href="/risk-intelligence/risk-models" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Risk Models</p>
          <p className="mt-1 text-sm text-text-muted">
            {activeModelCount} active model{activeModelCount === 1 ? "" : "s"} out of {riskModels.length} configured.
            Detector types with none use their own built-in default.
          </p>
        </Link>
        <Link href="/risk-intelligence/assessments" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Risk Assessments</p>
          <p className="mt-1 text-sm text-text-muted">Exposure snapshots tracked per industry over time.</p>
        </Link>
        <Link href="/risk-intelligence/knowledge" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Risk Knowledge</p>
          <p className="mt-1 text-sm text-text-muted">The shared taxonomy of threat types, risk types, treatments, and industries.</p>
        </Link>
        <Link href="/risk-intelligence/playbooks" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Playbooks</p>
          <p className="mt-1 text-sm text-text-muted">
            {playbooks.length} playbook{playbooks.length === 1 ? "" : "s"} -- ordered procedures linked to the risk
            factors they apply to.
          </p>
        </Link>
        <Link href="/risk-intelligence/outages" className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Cloud Provider Outages</p>
          <p className="mt-1 text-sm text-text-muted">
            {outages.length} unresolved outage{outages.length === 1 ? "" : "s"} right now.
          </p>
        </Link>
      </div>

      {unresolvedInsights.length === 0 && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No unresolved insights right now.
        </p>
      )}
    </div>
  );
}
