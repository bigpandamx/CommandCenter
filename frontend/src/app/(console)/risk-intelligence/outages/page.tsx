import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listOutages } from "../../../../lib/adminApiClient";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

export default async function OutagesPage() {
  const config = await requireSession();
  const { outages } = await listOutages(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
          <h1 className="text-lg font-semibold text-text-primary">Cloud Provider Outages</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Staff-reported -- not a live status-page integration, the same legitimate pattern staff-curated threat
            actor data already uses. Reporting one generates an insight and lets you see exactly which
            organizations and systems are affected.
          </p>
        </div>
        <Link href="/risk-intelligence/outages/new" className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500">
          Report outage
        </Link>
      </div>

      {outages.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">No outages reported yet.</p>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {outages.map((o) => (
            <Link key={o.id} href={`/risk-intelligence/outages/${o.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-raised">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[o.severity]}`}>{o.severity}</span>
                  <span className="text-xs text-text-muted">{o.vendor}</span>
                  {o.isResolved && <span className="text-xs text-text-muted">· resolved</span>}
                </div>
                <p className="mt-1 text-sm text-text-primary">{o.title}</p>
              </div>
              <p className="shrink-0 pl-4 text-xs text-text-muted">{new Date(o.startedAt).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
