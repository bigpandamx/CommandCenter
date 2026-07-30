import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listRiskKnowledgeEntries } from "../../../../lib/adminApiClient";

const CATEGORIES = [
  { key: "threat_type", label: "Threat Types", description: "The kinds of threats a risk can originate from." },
  { key: "risk_type", label: "Risk Types", description: "The kinds of risk an organization can be exposed to." },
  { key: "treatment", label: "Treatments", description: "Reusable response types -- mitigations are treatments with treatmentType \"mitigate,\" not a separate category." },
  { key: "industry", label: "Industries", description: "The industry vocabulary insights and assessments are scoped by." },
] as const;

export default async function RiskKnowledgePage() {
  const config = await requireSession();
  const counts = await Promise.all(CATEGORIES.map((c) => listRiskKnowledgeEntries(config, c.key)));

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence</p>
      <h1 className="text-lg font-semibold text-text-primary">Risk Knowledge</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        A shared, platform-wide catalog -- unlike Business Assets, which is each organization&apos;s own private
        inventory, these four vocabularies are the same for everyone.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CATEGORIES.map((c, i) => (
          <Link key={c.key} href={`/risk-intelligence/knowledge/${c.key}`} className="rounded-lg border border-border bg-surface p-5 hover:border-primary-500">
            <p className="text-sm font-semibold text-text-primary">{c.label}</p>
            <p className="mt-1 text-sm text-text-muted">{c.description}</p>
            <p className="mt-2 text-xs text-text-muted">{counts[i]!.entries.length} entries</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
