import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getControlLibraryStats } from "../../../../lib/adminApiClient";

export default async function ComplianceControlsPage() {
  const config = await requireSession();
  const { stats } = await getControlLibraryStats(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/compliance" className="text-sm text-text-muted hover:underline">
            ← Compliance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Control Library</h1>
          <p className="mt-1 text-sm text-text-muted">
            Employees maintain the canonical controls -- many obligations across many jurisdictions map onto the
            same control, instead of every obligation becoming its own disconnected requirement. This isn&apos;t
            customer data. It&apos;s platform intelligence.
          </p>
        </div>
        <Link href="/compliance/controls/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Control
        </Link>
      </div>

      {stats.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No controls created yet.
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {stats.map((s) => (
            <Link
              key={s.controlId}
              href={`/compliance/controls/${s.controlKey}`}
              className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-primary">
                  <span className="font-mono text-xs text-text-muted">{s.controlCode}</span> — {s.controlName}
                </p>
                <div className="flex shrink-0 gap-4 text-right">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{s.mappedObligationCount.toLocaleString()}</p>
                    <p className="text-xs text-text-muted">Mapped Rules</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{s.organizationsImpactedCount.toLocaleString()}</p>
                    <p className="text-xs text-text-muted">Organizations Impacted</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
