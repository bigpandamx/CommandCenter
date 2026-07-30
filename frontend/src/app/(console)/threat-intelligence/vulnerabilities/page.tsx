import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listVulnerabilities } from "../../../../lib/adminApiClient";
import { SyncVulnerabilitiesButton } from "../../../../components/SyncVulnerabilitiesButton";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
  none: "bg-surface-raised text-text-muted",
};

export default async function VulnerabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; exploited?: string }>;
}) {
  const { severity, exploited } = await searchParams;
  const config = await requireSession();

  const validSeverity =
    severity === "critical" || severity === "high" || severity === "medium" || severity === "low" || severity === "none" ? severity : undefined;
  const isKnownExploited = exploited === "true" ? true : undefined;

  const { vulnerabilities } = await listVulnerabilities(config, { severity: validSeverity, isKnownExploited });

  const severityTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "Critical", value: "critical" },
    { label: "High", value: "high" },
    { label: "Medium", value: "medium" },
    { label: "Low", value: "low" },
  ];

  function buildHref(nextSeverity: string | undefined, nextExploited: boolean) {
    const params = new URLSearchParams();
    if (nextSeverity) params.set("severity", nextSeverity);
    if (nextExploited) params.set("exploited", "true");
    const query = params.toString();
    return `/threat-intelligence/vulnerabilities${query ? `?${query}` : ""}`;
  }

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Vulnerabilities</h1>
          <p className="mt-1 text-sm text-text-muted">
            Synced from NVD&rsquo;s CVE API -- a rolling recent window, not the full 370,000+ record archive.
          </p>
        </div>
        <SyncVulnerabilitiesButton />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {severityTabs.map((tab) => (
          <Link
            key={tab.label}
            href={buildHref(tab.value, isKnownExploited === true)}
            className={`rounded px-3 py-1 text-sm ${
              validSeverity === tab.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href={buildHref(validSeverity, !isKnownExploited)}
          className={`rounded px-3 py-1 text-sm ${
            isKnownExploited ? "bg-danger text-white" : "border border-border text-text-primary hover:bg-surface-raised"
          }`}
        >
          Known Exploited (KEV)
        </Link>
      </div>

      {vulnerabilities.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing in the current window matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {vulnerabilities.map((v) => (
            <div key={v.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm text-text-primary">{v.cveId}</p>
                    {v.cvssBaseSeverity && (
                      <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[v.cvssBaseSeverity]}`}>
                        {v.cvssBaseSeverity} {v.cvssBaseScore !== null ? `(${v.cvssBaseScore})` : ""}
                      </span>
                    )}
                    {v.isKnownExploited && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">KEV</span>}
                  </div>
                  <p className="mt-1 text-sm text-text-muted">{v.description}</p>
                  {v.affectedProducts && v.affectedProducts.length > 0 && (
                    <p className="mt-1 truncate font-mono text-xs text-text-muted">{v.affectedProducts.slice(0, 3).join(", ")}</p>
                  )}
                  {v.isKnownExploited && v.kevRequiredAction && (
                    <p className="mt-1 text-xs text-danger">
                      CISA required action: {v.kevRequiredAction}
                      {v.kevDueDate ? ` (due ${new Date(v.kevDueDate).toLocaleDateString()})` : ""}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-text-muted">{new Date(v.lastModifiedAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
