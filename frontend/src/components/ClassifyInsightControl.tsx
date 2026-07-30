"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RiskFactorOption {
  key: string;
  name: string;
}

export function ClassifyInsightControl({
  insightId,
  linkedFactors,
  availableFactors,
}: {
  insightId: string;
  linkedFactors: RiskFactorOption[];
  availableFactors: RiskFactorOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  const linkedKeys = new Set(linkedFactors.map((f) => f.key));
  const unlinkedOptions = availableFactors.filter((f) => !linkedKeys.has(f.key));

  async function handleClassify() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/insights/${encodeURIComponent(insightId)}/risk-factors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskFactorKey: selected }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't classify this insight.");
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDeclassify(riskFactorKey: string) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(
        `/api/risk-intelligence/insights/${encodeURIComponent(insightId)}/risk-factors/${encodeURIComponent(riskFactorKey)}/remove`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't remove that classification.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {linkedFactors.length === 0 ? (
        <p className="text-sm text-text-muted">Not yet classified under any risk factor.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {linkedFactors.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary"
            >
              {f.name}
              <button
                type="button"
                onClick={() => handleDeclassify(f.key)}
                disabled={pending}
                className="text-text-muted hover:text-danger"
                aria-label={`Remove ${f.name} classification`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {unlinkedOptions.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">Classify under…</option>
            {unlinkedOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleClassify}
            disabled={pending || !selected}
            className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-primary-500 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
