import Link from "next/link";
import { requireSession } from "../../../../../../lib/session";
import { getObligationImpact, listControlsForObligation, listComplianceControls, listObligationsForUpdate } from "../../../../../../lib/adminApiClient";
import { DistributeButton } from "../../../../../../components/DistributeButton";
import { ControlsControl } from "../../../../../../components/ControlsControl";
import { ObligationReviewActions } from "../../../../../../components/ObligationReviewActions";

export default async function ObligationImpactPage({
  params,
}: {
  params: Promise<{ updateId: string; obligationId: string }>;
}) {
  const { updateId, obligationId } = await params;
  const config = await requireSession();
  const [{ results }, { controls: mappedControls }, { controls: allControls }, { obligations }] = await Promise.all([
    getObligationImpact(config, obligationId),
    listControlsForObligation(config, obligationId),
    listComplianceControls(config),
    listObligationsForUpdate(config, updateId),
  ]);

  const thisObligation = obligations.find((o) => o.id === obligationId);
  const siblings = obligations.filter((o) => o.id !== obligationId && o.mergedIntoObligationId === null);

  const affected = results.filter((r) => r.affected);
  const excluded = results.filter((r) => !r.affected);

  return (
    <div>
      <Link href={`/compliance/${updateId}`} className="text-sm text-text-muted hover:underline">
        ← Back
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{thisObligation?.description ?? "Obligation"}</h1>
      {thisObligation && (
        <p className="mt-1 text-xs text-text-muted">
          {thisObligation.obligationType}
          {thisObligation.industries.length > 0 ? ` · ${thisObligation.industries.join(", ")}` : ""}
          {thisObligation.deadlineDescription ? ` · Due: ${thisObligation.deadlineDescription}` : ""}
        </p>
      )}

      {thisObligation && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-3">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Review</p>
          <div className="mt-2">
            <ObligationReviewActions
              obligationId={obligationId}
              status={thisObligation.status}
              confidence={thisObligation.confidence}
              description={thisObligation.description}
              obligationType={thisObligation.obligationType}
              deadlineDescription={thisObligation.deadlineDescription}
              siblings={siblings}
            />
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold text-text-primary">Impact Assessment</h2>
      <p className="mt-1 text-sm text-text-muted">
        {affected.length} affected, {excluded.length} not affected, out of {results.length} organizations.
      </p>

      <div className="mt-4">
        <DistributeButton obligationId={obligationId} affectedCount={affected.length} />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Affected Controls</p>
        <div className="mt-2">
          <ControlsControl obligationId={obligationId} mapped={mappedControls} allControls={allControls} aiConfigured={true} />
        </div>
      </div>

      {affected.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium text-text-muted">Affected</p>
          <div className="mt-2 space-y-2">
            {affected.map((r) => (
              <div key={r.organizationId} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-primary">{r.organizationName}</p>
                  {r.riskLevel && <span className="text-xs text-text-muted">{r.riskLevel}</span>}
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-text-muted">
                  {r.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium text-text-muted">Not Affected</p>
          <div className="mt-2 space-y-1">
            {excluded.map((r) => (
              <div key={r.organizationId} className="rounded border border-border px-3 py-2 text-xs text-text-muted">
                {r.organizationName} — {r.reasons.join(" ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
