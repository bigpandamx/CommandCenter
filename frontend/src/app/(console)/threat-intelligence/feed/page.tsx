import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listThreatPatterns } from "../../../../lib/adminApiClient";
import { ThreatPatternItemActions } from "../../../../components/ThreatPatternItemActions";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
  info: "bg-surface-raised text-text-muted",
};

export default async function ThreatFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; status?: string }>;
}) {
  const { severity, status } = await searchParams;
  const config = await requireSession();

  const validSeverity =
    severity === "critical" || severity === "high" || severity === "medium" || severity === "low" || severity === "info" ? severity : undefined;
  const isActive = status === "inactive" ? false : status === "active" ? true : undefined;

  const { patterns } = await listThreatPatterns(config, { severity: validSeverity, isActive });

  const severityTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "Critical", value: "critical" },
    { label: "High", value: "high" },
    { label: "Medium", value: "medium" },
    { label: "Low", value: "low" },
    { label: "Info", value: "info" },
  ];

  function buildHref(nextSeverity: string | undefined, nextStatus: string | undefined) {
    const params = new URLSearchParams();
    if (nextSeverity) params.set("severity", nextSeverity);
    if (nextStatus) params.set("status", nextStatus);
    const query = params.toString();
    return `/threat-intelligence/feed${query ? `?${query}` : ""}`;
  }

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Threat Feed</h1>
          <p className="mt-1 text-sm text-text-muted">
            Platform-wide, cross-org threat patterns Aegis&rsquo;s local detectors sync against.
          </p>
        </div>
        <Link href="/threat-intelligence/feed/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Pattern
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {severityTabs.map((tab) => (
          <Link
            key={tab.label}
            href={buildHref(tab.value, status)}
            className={`rounded px-3 py-1 text-sm ${
              validSeverity === tab.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href={buildHref(validSeverity, isActive === false ? undefined : "inactive")}
          className={`rounded px-3 py-1 text-sm ${
            isActive === false ? "bg-text-muted text-white" : "border border-border text-text-primary hover:bg-surface-raised"
          }`}
        >
          Inactive
        </Link>
      </div>

      {patterns.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {patterns.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-text-primary">{p.patternName}</p>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[p.severity]}`}>{p.severity}</span>
                    <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">{p.threatType.replace(/_/g, " ")}</span>
                    {p.verifiedByAnalyst && <span className="rounded bg-ok/10 px-1.5 py-0.5 text-xs text-ok">verified</span>}
                    {p.isFalsePositive && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">false positive</span>}
                    {!p.isActive && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">inactive</span>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-muted">{p.patternId}</p>
                  <p className="mt-1 text-sm text-text-muted">{p.description}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {p.totalObservations} observations · {p.affectedOrganizationsCount} orgs affected
                    {p.affectedIndustries && p.affectedIndustries.length > 0 ? ` · ${p.affectedIndustries.join(", ")}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-text-muted">{new Date(p.lastObserved).toLocaleDateString()}</p>
              </div>
              <ThreatPatternItemActions
                id={p.id}
                isActive={p.isActive}
                isFalsePositive={p.isFalsePositive}
                verifiedByAnalyst={p.verifiedByAnalyst}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
