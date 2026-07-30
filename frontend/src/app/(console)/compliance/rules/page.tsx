import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listComplianceRules } from "../../../../lib/adminApiClient";

export default async function ComplianceRulesPage() {
  const config = await requireSession();
  const { rules } = await listComplianceRules(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/compliance" className="text-sm text-text-muted hover:underline">
            ← Compliance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Rules</h1>
          <p className="mt-1 text-sm text-text-muted">
            A rule groups related documents into one evolving regulatory topic -- an original rule, its correction, its
            implementation guidance.
          </p>
        </div>
        <Link href="/compliance/rules/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Rule
        </Link>
      </div>

      {rules.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No rules created yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {rules.map((r) => (
            <Link key={r.id} href={`/compliance/rules/${r.key}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500">
              <p className="text-sm text-text-primary">{r.name}</p>
              <p className="mt-1 text-xs text-text-muted">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
