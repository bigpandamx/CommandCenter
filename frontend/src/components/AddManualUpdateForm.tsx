"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddManualUpdateForm({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [externalId, setExternalId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!externalId.trim() || !title.trim() || !summary.trim() || !url.trim()) {
      setError("All fields are required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/compliance/sources/${sourceId}/manual-updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId, title, summary, url }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't add the update.");
        return;
      }
      router.push("/compliance/sources");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">External ID</label>
        <input
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="iso-42001-2023"
        />
        <p className="mt-1 text-xs text-text-muted">A stable identifier for this document -- re-adding the same ID is a no-op, not a duplicate.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="ISO/IEC 42001 AI Management System"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Source URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="https://iso.org/standard/42001"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add Update"}
      </button>
    </form>
  );
}
