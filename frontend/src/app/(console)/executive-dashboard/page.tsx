import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { getExecutiveDashboard } from "../../../lib/adminApiClient";

function NotYetAvailableCard({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 p-4">
      <p className="text-sm font-semibold text-text-muted">{title}</p>
      <p className="mt-1 text-xs text-warn">Not yet available</p>
      <p className="mt-2 text-xs text-text-muted">{reason}</p>
    </div>
  );
}

function levelColor(level: string): string {
  if (level === "critical") return "text-danger";
  if (level === "high") return "text-warn";
  return "text-text-primary";
}

export default async function ExecutiveDashboardPage() {
  const config = await requireSession();
  const dashboard = await getExecutiveDashboard(config);

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Strategic Overview</p>
      <h1 className="text-lg font-semibold text-text-primary">Executive Dashboard</h1>
      <p className="mt-1 text-sm text-text-muted">
        Generated {new Date(dashboard.generatedAt).toLocaleString()}. Every number below is computed from real,
        current data -- nothing here is estimated or illustrative.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Threat Activity -- real */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:col-span-2">
          <p className="text-sm font-semibold text-text-primary">Threat Activity</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-2xl font-semibold text-text-primary">{dashboard.threatActivity.activePatterns}</p>
              <p className="text-xs text-text-muted">active patterns</p>
              {dashboard.threatActivity.patternsPendingVerification > 0 && (
                <p className="text-xs text-warn">{dashboard.threatActivity.patternsPendingVerification} pending verification</p>
              )}
            </div>
            <div>
              <p className="text-2xl font-semibold text-danger">{dashboard.threatActivity.criticalVulnerabilities}</p>
              <p className="text-xs text-text-muted">critical CVEs</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-danger">{dashboard.threatActivity.knownExploitedVulnerabilities}</p>
              <p className="text-xs text-text-muted">known exploited (KEV)</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary">{dashboard.threatActivity.activeThreatActors}</p>
              <p className="text-xs text-text-muted">tracked threat actors</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary">{dashboard.threatActivity.activeCampaigns}</p>
              <p className="text-xs text-text-muted">tracked campaigns</p>
            </div>
          </div>
          <Link href="/threat-intelligence" className="mt-3 inline-block text-xs text-primary-600 hover:underline">
            View Threat Intelligence →
          </Link>
        </div>

        {/* Compliance Coverage -- real, but explicitly "coverage" not "score" */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text-primary">Compliance Coverage</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{dashboard.complianceCoverage.averageCoveragePercent}%</p>
          <p className="text-xs text-text-muted">
            average across {dashboard.complianceCoverage.frameworkCount} framework{dashboard.complianceCoverage.frameworkCount === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            &ldquo;Coverage&rdquo; means a control has a mapped obligation, not that it&rsquo;s verified satisfied --
            deliberately not called a &ldquo;compliance score.&rdquo;
          </p>
          {dashboard.complianceCoverage.perFramework.length > 0 && (
            <div className="mt-3 space-y-1">
              {dashboard.complianceCoverage.perFramework.map((f) => (
                <div key={f.frameworkKey} className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{f.frameworkName}</span>
                  <span className="text-text-primary">{f.coveragePercent}%</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/compliance" className="mt-3 inline-block text-xs text-primary-600 hover:underline">
            View Compliance →
          </Link>
        </div>

        {/* Business Impact -- real, narrower than "score" */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text-primary">Business Impact</p>
          <div className="mt-1 flex gap-4">
            <div>
              <p className="text-2xl font-semibold text-danger">{dashboard.businessImpact.unresolvedCriticalInsights}</p>
              <p className="text-xs text-text-muted">unresolved critical</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-warn">{dashboard.businessImpact.unresolvedHighInsights}</p>
              <p className="text-xs text-text-muted">unresolved high</p>
            </div>
          </div>
          {dashboard.businessImpact.recentCriticalInsights.length > 0 && (
            <div className="mt-3 space-y-2">
              {dashboard.businessImpact.recentCriticalInsights.map((insight) => (
                <div key={insight.id} className="rounded border border-border bg-surface-raised p-2">
                  <p className="text-xs text-text-muted">{insight.industry}</p>
                  <p className="text-xs text-text-primary">{insight.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Industry Risk Trends -- real, explicitly per-industry not company-wide */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:col-span-2">
          <p className="text-sm font-semibold text-text-primary">Risk Trends by Industry</p>
          <p className="mt-1 text-xs text-text-muted">
            Scoped to industry, not a single company-wide number -- no such aggregate exists in this system.
          </p>
          {dashboard.industryRiskTrends.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">No industries have both risk insights and an assessment snapshot yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {dashboard.industryRiskTrends.map((trend) => (
                <div key={trend.industry} className="flex items-center justify-between rounded border border-border bg-surface-raised p-2">
                  <div>
                    <p className="text-sm text-text-primary">{trend.industry}</p>
                    <p className="text-xs text-text-muted">as of {new Date(trend.assessedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${levelColor(trend.latestExposureLevel)}`}>{trend.latestExposureLevel}</p>
                    <p className="text-xs text-text-muted">score {trend.latestExposureScore}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Not yet available -- explicitly flagged, not faked */}
        <NotYetAvailableCard
          title="Overall Organizational Risk Score"
          reason="No single company-wide or per-customer risk number exists in this system today -- only industry-level exposure scores (above)."
        />
        <NotYetAvailableCard
          title="Asset Health"
          reason="Business assets track criticality and active status, but no health/status signal is stored anywhere yet."
        />
        <NotYetAvailableCard
          title="Financial Exposure"
          reason="No dollar-value risk quantification exists in this system. Billing data reflects Command Center's own subscription revenue, not risk cost modeling."
        />
        <NotYetAvailableCard
          title="AI-Generated Executive Summaries"
          reason="No internal summarization infrastructure exists yet. The only AI feature in this system today is customer-facing device support chat."
        />
      </div>
    </div>
  );
}
