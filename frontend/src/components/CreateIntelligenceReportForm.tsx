"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function CreateIntelligenceReportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [relatedPatternIds, setRelatedPatternIds] = useState("");
  const [relatedActorIds, setRelatedActorIds] = useState("");
  const [relatedVulnerabilityCveIds, setRelatedVulnerabilityCveIds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !summary.trim() || !body.trim()) {
      setError("Title, summary, and body are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/threat-intel/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          body,
          relatedPatternIds: splitCommaList(relatedPatternIds),
          relatedActorIds: splitCommaList(relatedActorIds),
          relatedVulnerabilityCveIds: splitCommaList(relatedVulnerabilityCveIds),
        }),
      });

      if (!response.ok) {
        const respBody = await response.json().catch(() => ({}));
        setError(respBody.message ?? "Couldn't create the report.");
        return;
      }

      const created = await response.json();
      router.push(`/threat-intelligence/reports/${created.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="Q3 2026 Ransomware Landscape"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="A short abstract -- what this report covers, at a glance."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
          placeholder="The full report."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-text-muted">Related Pattern IDs (comma-separated)</label>
          <input
            value={relatedPatternIds}
            onChange={(e) => setRelatedPatternIds(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            placeholder="THREAT-2026-001, ..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Related Actor IDs (comma-separated)</label>
          <input
            value={relatedActorIds}
            onChange={(e) => setRelatedActorIds(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Related CVEs (comma-separated)</label>
          <input
            value={relatedVulnerabilityCveIds}
            onChange={(e) => setRelatedVulnerabilityCveIds(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            placeholder="CVE-2026-12345, ..."
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Report"}
      </button>
    </form>
  );
}
