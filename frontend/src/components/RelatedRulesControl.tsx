"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RelatedRule {
  key: string;
  name: string;
}

export function RelatedRulesControl({
  ruleKey,
  related,
  allRules,
}: {
  ruleKey: string;
  related: RelatedRule[];
  allRules: RelatedRule[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relatedKeys = new Set(related.map((r) => r.key));
  const candidates = allRules.filter((r) => r.key !== ruleKey && !relatedKeys.has(r.key));

  async function handleAdd() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/rules/${ruleKey}/related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedRuleKey: selected }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't add.");
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(relatedRuleKey: string) {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/compliance/rules/${ruleKey}/related/${relatedRuleKey}/remove`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {related.length === 0 ? (
        <p className="text-sm text-text-muted">No related rules yet.</p>
      ) : (
        <div className="space-y-1">
          {related.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
              <a href={`/compliance/rules/${r.key}`} className="text-text-primary hover:underline">
                {r.name}
              </a>
              <button onClick={() => handleRemove(r.key)} disabled={pending} className="text-xs text-text-muted hover:text-danger">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          >
            <option value="">Relate to another rule…</option>
            {candidates.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selected || pending}
            className="rounded bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
