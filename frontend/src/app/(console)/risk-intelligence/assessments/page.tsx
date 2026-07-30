import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listInsights } from "../../../../lib/adminApiClient";
import { IndustryLookupForm } from "../../../../components/IndustryLookupForm";

export default async function RiskAssessmentsPage() {
  const config = await requireSession();
  const { insights } = await listInsights(config, { limit: 200 });
  const industries = [...new Set(insights.map((i) => i.industry))].sort();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
      <h1 className="text-lg font-semibold text-text-primary">Risk Assessments</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        A persisted exposure snapshot per industry, tracked over time -- "was this better or worse 30 days ago."
        Computed from unresolved insights at the moment each snapshot runs, not a live number.
      </p>

      <div className="mt-6">
        <IndustryLookupForm />
      </div>

      {industries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Industries with recent insights</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {industries.map((industry) => (
              <Link
                key={industry}
                href={`/risk-intelligence/assessments/${encodeURIComponent(industry)}`}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-primary hover:border-primary-500"
              >
                {industry}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
