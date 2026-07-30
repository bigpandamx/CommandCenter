import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { listRiskKnowledgeEntries, type RiskKnowledgeCategory } from "../../../../../lib/adminApiClient";
import { CreateKnowledgeEntryForm } from "../../../../../components/CreateKnowledgeEntryForm";

const CATEGORY_LABEL: Record<string, string> = {
  threat_type: "Threat Types",
  risk_type: "Risk Types",
  treatment: "Treatments",
  industry: "Industries",
};

const TREATMENT_TYPE_LABEL: Record<string, string> = {
  avoid: "Avoid",
  mitigate: "Mitigate",
  transfer: "Transfer",
  accept: "Accept",
};

const VALID_CATEGORIES = ["threat_type", "risk_type", "treatment", "industry"];

export default async function KnowledgeCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!VALID_CATEGORIES.includes(category)) notFound();
  const config = await requireSession();
  const { entries } = await listRiskKnowledgeEntries(config, category as RiskKnowledgeCategory);

  return (
    <div>
      <Link href="/risk-intelligence/knowledge" className="text-xs text-text-muted hover:text-text-primary">
        ← Risk Knowledge
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">{CATEGORY_LABEL[category]}</h1>

      {entries.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No entries yet in this category.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {entries.map((entry) => (
            <div key={entry.key} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">{entry.name}</span>
                {entry.treatmentType && (
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-primary">
                    {TREATMENT_TYPE_LABEL[entry.treatmentType] ?? entry.treatmentType}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{entry.description}</p>
            </div>
          ))}
        </div>
      )}

      <CreateKnowledgeEntryForm category={category} />
    </div>
  );
}
