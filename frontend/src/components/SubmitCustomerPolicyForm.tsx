"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmitCustomerPolicyForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
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
      const response = await fetch(`/api/organizations/${organizationId}/customer-policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, documentUrl: documentUrl.trim() === "" ? null : documentUrl }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't submit the policy.");
        return;
      }
      setName("");
      setDescription("");
      setDocumentUrl("");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
        Submit a Policy
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
          placeholder="Acme Corp AI Usage Policy"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="What the customer's document says, in your own words."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Document URL (optional)</label>
        <input
          value={documentUrl}
          onChange={(e) => setDocumentUrl(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="https://..."
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
