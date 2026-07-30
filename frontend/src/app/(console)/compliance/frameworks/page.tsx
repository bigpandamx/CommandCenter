import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listComplianceFrameworks, getFrameworkCoverage } from "../../../../lib/adminApiClient";

export default async function ComplianceFrameworksPage() {
  const config = await requireSession();
  const { frameworks } = await listComplianceFrameworks(config);
  const coverage = await Promise.all(frameworks.map((f) => getFrameworkCoverage(config, f.key)));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/compliance" className="text-sm text-text-muted hover:underline">
            ← Compliance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Frameworks</h1>
          <p className="mt-1 text-sm text-text-muted">
            Not rules -- collections of controls. Named external standards (NIST AI RMF, ISO 42001, HIPAA, SOC 2, ...),
            each requiring a real set of canonical controls. Coverage shows how many of a framework&apos;s required
            controls are actually backed by regulatory analysis, not a claim that any framework is satisfied.
          </p>
        </div>
        <Link href="/compliance/frameworks/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Framework
        </Link>
      </div>

      {frameworks.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No frameworks created yet.
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {frameworks.map((f, i) => {
            const c = coverage[i]!;
            return (
              <Link
                key={f.id}
                href={`/compliance/frameworks/${f.key}`}
                className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">{f.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{f.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-text-primary">
                      {c.controlsWithMappedObligations} / {c.requiredControlCount}
                    </p>
                    <p className="text-xs text-text-muted">Controls Backed</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
