"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmitThreatActorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    setSubmitting(true);
    try {
      const aliasList = aliases
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      const response = await fetch("/api/threat-intel/threat-actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, aliases: aliasList.length > 0 ? aliasList : undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't add the actor.");
        return;
      }
      setName("");
      setDescription("");
      setAliases("");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
        Add Staff-Curated Actor
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-surface p-3">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div>
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="e.g. a group observed locally, not yet in MITRE's own catalog"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Aliases (comma-separated, optional)</label>
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="Known also as..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
