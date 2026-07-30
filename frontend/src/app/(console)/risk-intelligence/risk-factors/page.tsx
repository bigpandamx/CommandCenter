import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listRiskFactors } from "../../../../lib/adminApiClient";

export default async function RiskFactorsPage() {
  const config = await requireSession();
  const { riskFactors } = await listRiskFactors(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
          <h1 className="text-lg font-semibold text-text-primary">Risk Factors</h1>
          <p className="mt-1 text-sm text-text-muted">
            The taxonomy insights get classified under -- Vendor Risk, AI Risk, Cyber Risk, or any other dimension
            staff defines. A risk factor doesn&apos;t require anything; it classifies what&apos;s already been
            detected, applied by staff after the fact.
          </p>
        </div>
        <Link
          href="/risk-intelligence/risk-factors/new"
          className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500"
        >
          New risk factor
        </Link>
      </div>

      {riskFactors.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No risk factors defined yet. Create one to start classifying insights by domain.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {riskFactors.map((factor) => (
            <Link
              key={factor.key}
              href={`/risk-intelligence/risk-factors/${factor.key}`}
              className="block px-4 py-3 hover:bg-surface-raised"
            >
              <p className="text-sm text-text-primary">{factor.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">{factor.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
