"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TREATMENT_TYPES = [
  { value: "avoid", label: "Avoid" },
  { value: "mitigate", label: "Mitigate" },
  { value: "transfer", label: "Transfer" },
  { value: "accept", label: "Accept" },
] as const;

export function CreateKnowledgeEntryForm({ category }: { category: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [treatmentType, setTreatmentType] = useState<(typeof TREATMENT_TYPES)[number]["value"]>("mitigate");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/knowledge/${encodeURIComponent(category)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category === "treatment" ? { key, name, description, treatmentType } : { key, name, description }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't create that entry.");
        return;
      }
      setKey("");
      setName("");
      setDescription("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="key"
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        {category === "treatment" ? (
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
        ) : (
          <div />
        )}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description"
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
      />
      <button
        type="submit"
        disabled={pending || !key.trim() || !name.trim() || !description.trim()}
        className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add entry"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
