import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listComplianceUpdates, listObligationsForUpdate, getComplianceAnalysis, listComplianceRules, AdminApiError } from "../../../../lib/adminApiClient";
import { RuleLinkControl } from "../../../../components/RuleLinkControl";
import { QueueItemActions } from "../../../../components/QueueItemActions";

export default async function ComplianceUpdateDetailPage({ params }: { params: Promise<{ updateId: string }> }) {
  const { updateId } = await params;
  const config = await requireSession();

  const [{ updates }, { obligations }, analysis, { rules: allRules }] = await Promise.all([
    listComplianceUpdates(config, { limit: 200 }),
    listObligationsForUpdate(config, updateId),
    getComplianceAnalysis(config, updateId).catch((err) => {
      if (err instanceof AdminApiError && err.status === 404) return null;
      throw err;
    }),
    listComplianceRules(config),
  ]);

  const update = updates.find((u) => u.id === updateId);

  if (!update) {
    return (
      <div>
        <Link href="/compliance" className="text-sm text-text-muted hover:underline">
          ← Compliance
        </Link>
        <p className="mt-4 text-sm text-text-muted">Update not found.</p>
      </div>
    );
  }

  const linkedRule = update.ruleId ? allRules.find((r) => r.id === update.ruleId) ?? null : null;

  return (
    <div>
      <Link href="/compliance" className="text-sm text-text-muted hover:underline">
        ← Compliance
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{update.title}</h1>
      <div className="mt-1 flex gap-3 text-sm text-text-muted">
        <span>{update.country ?? "Country unset"}</span>
        <span>·</span>
        <span>{update.industries.length > 0 ? update.industries.join(", ") : "No industries set"}</span>
        <span>·</span>
        <span>{update.documentType}</span>
      </div>
      {update.summary && <p className="mt-3 text-sm text-text-primary">{update.summary}</p>}

      <RuleLinkControl updateId={updateId} linkedRule={linkedRule} allRules={allRules} />

      <div className="mt-4 rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-text-muted">
          Queue status: <span className="text-text-primary">{update.status.replace("_", " ")}</span>
        </p>
        <div className="mt-2">
          <QueueItemActions updateId={updateId} status={update.status} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">AI Analysis</p>
        {analysis ? (
          <>
            <p className="mt-2 text-sm text-text-primary">{analysis.summary}</p>
            <p className="mt-2 text-xs text-text-muted">
              Risk level: <span className="text-text-primary">{analysis.riskLevel}</span>
            </p>
            {analysis.actionItems.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-primary">
                {analysis.actionItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-text-muted">Not analyzed yet.</p>
        )}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">Obligations</p>
        {obligations.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No obligations extracted for this update yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {obligations.map((o) => (
              <Link
                key={o.id}
                href={`/compliance/${updateId}/obligations/${o.id}`}
                className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-primary">{o.description}</p>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                      o.status === "approved"
                        ? "bg-ok/10 text-ok"
                        : o.status === "rejected"
                          ? "bg-danger/10 text-danger"
                          : "bg-surface-raised text-text-muted"
                    }`}
                  >
                    {o.status.replace("_", " ")}
                    {o.confidence !== null ? ` · ${o.confidence}%` : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {o.obligationType}
                  {o.industries.length > 0 ? ` · ${o.industries.join(", ")}` : ""}
                  {o.deadlineDescription ? ` · Due: ${o.deadlineDescription}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
