import { requireSession } from "../../../../../lib/session";
import { listRiskAssessmentHistory } from "../../../../../lib/adminApiClient";
import { TriggerAssessmentButton } from "../../../../../components/TriggerAssessmentButton";

const EXPOSURE_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

export default async function IndustryAssessmentPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  const config = await requireSession();
  const { assessments } = await listRiskAssessmentHistory(config, industry);

  const latest = assessments[0] ?? null;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Assessments</p>
          <h1 className="text-lg font-semibold text-text-primary">{industry}</h1>
        </div>
        <TriggerAssessmentButton industry={industry} />
      </div>

      {latest ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <span className={`rounded px-2 py-1 text-sm ${EXPOSURE_STYLES[latest.exposureLevel]}`}>{latest.exposureLevel}</span>
          <div>
            <p className="text-sm text-text-primary">Current exposure score: {latest.exposureScore}</p>
            <p className="text-xs text-text-muted">
              Last assessed {new Date(latest.assessedAt).toLocaleString()} · from {latest.contributingInsightIds.length}{" "}
              unresolved insight{latest.contributingInsightIds.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No assessment has been recorded for this industry yet. Run one to get a starting snapshot.
        </p>
      )}

      {assessments.length > 1 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">History</h2>
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {assessments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${EXPOSURE_STYLES[a.exposureLevel]}`}>{a.exposureLevel}</span>
                  <span className="text-sm text-text-primary">Score {a.exposureScore}</span>
                </div>
                <p className="text-xs text-text-muted">{new Date(a.assessedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
