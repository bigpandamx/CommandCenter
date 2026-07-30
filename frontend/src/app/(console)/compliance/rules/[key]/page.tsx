import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { getComplianceRule, listComplianceRules } from "../../../../../lib/adminApiClient";
import { RelatedRulesControl } from "../../../../../components/RelatedRulesControl";
import { InterpretButton } from "../../../../../components/InterpretButton";

export default async function RuleDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [detail, { rules: allRules }] = await Promise.all([getComplianceRule(config, key), listComplianceRules(config)]);
  const rule = allRules.find((r) => r.key === key);

  return (
    <div>
      <Link href="/compliance/rules" className="text-sm text-text-muted hover:underline">
        ← Rules
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{rule?.name ?? key}</h1>
      {rule && <p className="mt-1 text-sm text-text-muted">{rule.description}</p>}

      {detail.currentVersion && (
        <div className="mt-4 rounded-lg border border-primary-500/40 bg-primary-500/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-600">Current Version</p>
          <p className="mt-1 text-sm text-text-primary">{detail.currentVersion.title}</p>
          <p className="mt-1 text-xs text-text-muted">
            {detail.currentVersion.documentType}
            {detail.currentVersion.publishedAt ? ` · Published ${new Date(detail.currentVersion.publishedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Interpretation</p>
          <InterpretButton ruleKey={key} historyLength={detail.history.length} />
        </div>
        {detail.latestInterpretation ? (
          <>
            {detail.interpretationStale && (
              <p className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
                This rule&rsquo;s history has grown since this interpretation was generated -- it may no longer reflect the full
                picture.
              </p>
            )}
            <p className="mt-2 text-sm text-text-primary">{detail.latestInterpretation.interpretation}</p>
            <p className="mt-2 text-xs text-text-muted">
              Risk level: <span className="text-text-primary">{detail.latestInterpretation.currentRiskLevel}</span>
            </p>
            {detail.latestInterpretation.keyChanges.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-text-muted">What changed</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-primary">
                  {detail.latestInterpretation.keyChanges.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            {detail.latestInterpretation.currentActionItems.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-text-muted">Action items</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-primary">
                  {detail.latestInterpretation.currentActionItems.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            {detail.interpretationStale === null ? "AI isn't configured on this deployment." : "Not interpreted yet."}
          </p>
        )}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">History</p>
        {detail.history.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No documents linked to this rule yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {detail.history.map((u) => (
              <Link key={u.id} href={`/compliance/${u.id}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-primary-500">
                <p className="text-sm text-text-primary">{u.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {u.documentType}
                  {u.publishedAt ? ` · ${new Date(u.publishedAt).toLocaleDateString()}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">Related Rules</p>
        <div className="mt-2">
          <RelatedRulesControl ruleKey={key} related={detail.relatedRules} allRules={allRules} />
        </div>
      </div>
    </div>
  );
}
