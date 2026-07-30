import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listInsights } from "../../../../lib/adminApiClient";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

const TYPE_LABEL: Record<string, string> = {
  anomaly: "Anomaly",
  trend: "Trend",
  root_cause: "Root Cause",
  correlation: "Correlation",
  external_signal: "External Signal",
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; resolved?: string }>;
}) {
  const { severity, resolved } = await searchParams;
  const config = await requireSession();

  const validSeverity =
    severity === "critical" || severity === "high" || severity === "medium" || severity === "low" ? severity : undefined;
  const isResolved = resolved === "true" ? true : resolved === "false" ? false : undefined;

  const { insights } = await listInsights(config, { severity: validSeverity, isResolved, limit: 100 });

  const severityTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "Critical", value: "critical" },
    { label: "High", value: "high" },
    { label: "Medium", value: "medium" },
    { label: "Low", value: "low" },
  ];

  function buildHref(nextSeverity: string | undefined, nextResolved: string | undefined) {
    const params = new URLSearchParams();
    if (nextSeverity) params.set("severity", nextSeverity);
    if (nextResolved) params.set("resolved", nextResolved);
    const query = params.toString();
    return `/risk-intelligence/insights${query ? `?${query}` : ""}`;
  }

  return (
    <div>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
        <h1 className="text-lg font-semibold text-text-primary">Insights</h1>
        <p className="mt-1 text-sm text-text-muted">
          Everything Risk Intelligence has detected -- patterns computed from cross-org signal aggregates, and
          significant external events (CVEs, MITRE campaigns, compliance deadlines, provider outages).
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {severityTabs.map((tab) => (
            <Link
              key={tab.label}
              href={buildHref(tab.value, resolved)}
              className={`rounded px-3 py-1.5 text-sm ${
                severity === tab.value || (!severity && !tab.value)
                  ? "bg-surface-raised text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          <Link
            href={buildHref(severity, resolved === "false" ? undefined : "false")}
            className={`rounded border px-3 py-1.5 text-sm ${
              resolved === "false" ? "border-primary-500 text-text-primary" : "border-border text-text-muted hover:text-text-primary"
            }`}
          >
            Unresolved only
          </Link>
        </div>
      </div>

      {insights.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No insights match this filter.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {insights.map((insight) => (
            <Link
              key={insight.id}
              href={`/risk-intelligence/insights/${insight.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-raised"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[insight.severity]}`}>{insight.severity}</span>
                  <span className="text-xs text-text-muted">{TYPE_LABEL[insight.type] ?? insight.type}</span>
                  <span className="text-xs text-text-muted">{insight.industry}</span>
                  {insight.isResolved && <span className="text-xs text-text-muted">· resolved</span>}
                </div>
                <p className="mt-1 text-sm text-text-primary">{insight.summary}</p>
              </div>
              <p className="shrink-0 pl-4 text-xs text-text-muted">{new Date(insight.createdAt).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
