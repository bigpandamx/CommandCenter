import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listComplianceSources } from "../../../../lib/adminApiClient";
import { SourceRow } from "../../../../components/SourceRow";

export default async function ComplianceSourcesPage() {
  const config = await requireSession();
  const { sources } = await listComplianceSources(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/compliance" className="text-sm text-text-muted hover:underline">
            ← Compliance
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Sources</h1>
          <p className="mt-1 text-sm text-text-muted">
            Where regulatory documents come from. RSS/API sources are fetched on demand or via retry; manual sources have no
            feed -- documents are entered by hand.
          </p>
        </div>
        <Link href="/compliance/sources/new" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Source
        </Link>
      </div>

      {sources.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No sources registered yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}
