import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listPlaybooks } from "../../../../lib/adminApiClient";

export default async function PlaybooksPage() {
  const config = await requireSession();
  const { playbooks } = await listPlaybooks(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
          <h1 className="text-lg font-semibold text-text-primary">Playbooks</h1>
          <p className="mt-1 text-sm text-text-muted">
            Ordered response procedures, linked to the risk factors they apply to -- the answer to "is there a
            playbook for this kind of risk."
          </p>
        </div>
        <Link href="/risk-intelligence/playbooks/new" className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500">
          New playbook
        </Link>
      </div>

      {playbooks.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">No playbooks yet.</p>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {playbooks.map((p) => (
            <Link key={p.key} href={`/risk-intelligence/playbooks/${p.key}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-raised">
              <div>
                <p className="text-sm text-text-primary">{p.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{p.description}</p>
              </div>
              <p className="shrink-0 pl-4 text-xs text-text-muted">
                {p.steps.length === 0 ? "draft, no steps" : `${p.steps.length} step${p.steps.length === 1 ? "" : "s"}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
