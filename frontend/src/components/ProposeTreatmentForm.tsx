"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TREATMENT_TYPES = [
  { value: "avoid", label: "Avoid" },
  { value: "mitigate", label: "Mitigate" },
  { value: "transfer", label: "Transfer" },
  { value: "accept", label: "Accept" },
] as const;

export function ProposeTreatmentForm({ insightId }: { insightId: string }) {
  const router = useRouter();
  const [treatmentType, setTreatmentType] = useState<(typeof TREATMENT_TYPES)[number]["value"]>("mitigate");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/insights/${encodeURIComponent(insightId)}/treatments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatmentType, description }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't propose that treatment.");
        return;
      }
      setDescription("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <select
          value={treatmentType}
          onChange={(e) => setTreatmentType(e.target.value as (typeof TREATMENT_TYPES)[number]["value"])}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          {TREATMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={treatmentType === "accept" ? "Why this risk is acceptable as-is…" : "What action addresses this…"}
          className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        <button
          type="submit"
          disabled={pending || !description.trim()}
          className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
        >
          {pending ? "…" : "Propose"}
        </button>
      </div>
      {treatmentType === "accept" && (
        <p className="text-xs text-text-muted">
          Accepting is recorded as already completed -- the decision itself is the finished action, not the start of one.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
