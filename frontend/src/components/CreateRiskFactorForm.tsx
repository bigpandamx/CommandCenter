"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateRiskFactorForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/risk-intelligence/risk-factors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name, description }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? body.error ?? "Couldn't create that risk factor.");
        return;
      }
      router.push(`/risk-intelligence/risk-factors/${encodeURIComponent(body.key)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="key">
          Key
        </label>
        <input
          id="key"
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="vendor-risk"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <p className="mt-1 text-xs text-text-muted">Lowercase with dashes -- this is how insights and playbooks reference this factor.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vendor Risk"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What kind of risk this factor classifies…"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !key.trim() || !name.trim() || !description.trim()}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create risk factor"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
