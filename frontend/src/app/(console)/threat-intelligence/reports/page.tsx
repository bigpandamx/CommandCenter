import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listIntelligenceReports } from "../../../../lib/adminApiClient";
import { IntelligenceReportItemActions } from "../../../../components/IntelligenceReportItemActions";

export default async function IntelligenceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const config = await requireSession();

  const validStatus = status === "draft" || status === "published" ? status : undefined;
  const { reports } = await listIntelligenceReports(config, { status: validStatus });

  function buildHref(nextStatus: string | undefined) {
    return `/threat-intelligence/reports${nextStatus ? `?status=${nextStatus}` : ""}`;
  }

  const statusTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "Published", value: "published" },
    { label: "Drafts", value: "draft" },
  ];

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Intelligence Reports</h1>
          <p className="mt-1 text-sm text-text-muted">
            Analyst-authored synthesis, not tied to one pattern -- can cite multiple patterns, actors, and CVEs at once.
          </p>
        </div>
        <Link href="/threat-intelligence/reports/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Report
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {statusTabs.map((tab) => (
          <Link
            key={tab.label}
            href={buildHref(tab.value)}
            className={`rounded px-3 py-1 text-sm ${
              validStatus === tab.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/threat-intelligence/reports/${r.id}`} className="text-sm text-text-primary hover:underline">
                      {r.title}
                    </Link>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        r.status === "published" ? "bg-ok/10 text-ok" : "bg-surface-raised text-text-muted"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">{r.summary}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {r.relatedPatternIds?.length ? `${r.relatedPatternIds.length} pattern(s)` : ""}
                    {r.relatedActorIds?.length ? ` · ${r.relatedActorIds.length} actor(s)` : ""}
                    {r.relatedVulnerabilityCveIds?.length ? ` · ${r.relatedVulnerabilityCveIds.length} CVE(s)` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-text-muted">{new Date(r.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="mt-2">
                <IntelligenceReportItemActions id={r.id} status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
