"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

interface ExistingReport {
  id: string;
  title: string;
  summary: string;
  body: string;
  relatedPatternIds: string[] | null;
  relatedActorIds: string[] | null;
  relatedVulnerabilityCveIds: string[] | null;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
}

export function EditIntelligenceReportForm({ report }: { report: ExistingReport }) {
  const router = useRouter();
  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.summary);
  const [body, setBody] = useState(report.body);
  const [relatedPatternIds, setRelatedPatternIds] = useState((report.relatedPatternIds ?? []).join(", "));
  const [relatedActorIds, setRelatedActorIds] = useState((report.relatedActorIds ?? []).join(", "));
  const [relatedVulnerabilityCveIds, setRelatedVulnerabilityCveIds] = useState((report.relatedVulnerabilityCveIds ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!title.trim() || !summary.trim() || !body.trim()) {
      setError("Title, summary, and body are all required.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/threat-intel/reports/${report.id}`, {
        method: "PATCH",
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
        setError(respBody.message ?? "Couldn't save changes.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    setError(null);
    setTogglingStatus(true);
    try {
      const response = await fetch(`/api/threat-intel/reports/${report.id}/${report.status === "published" ? "unpublish" : "publish"}`, {
        method: "POST",
      });
      if (!response.ok) {
        const respBody = await response.json().catch(() => ({}));
        setError(respBody.message ?? "Couldn't update status.");
        return;
      }
      router.refresh();
    } finally {
      setTogglingStatus(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <span
          className={`rounded px-2 py-0.5 text-xs ${report.status === "published" ? "bg-ok/10 text-ok" : "bg-surface-raised text-text-muted"}`}
        >
          {report.status}
        </span>
        {report.publishedAt && <span className="text-xs text-text-muted">first published {new Date(report.publishedAt).toLocaleDateString()}</span>}
        <button
          onClick={handleToggleStatus}
          disabled={togglingStatus}
          className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
        >
          {report.status === "published" ? "Unpublish" : "Publish"}
        </button>
      </div>

      <form onSubmit={handleSave} className="mt-4 max-w-2xl space-y-4">
        {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {saved && <p className="text-xs text-ok">Saved.</p>}

        <div>
          <label className="block text-xs font-medium text-text-muted">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted">Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-text-muted">Related Pattern IDs</label>
            <input
              value={relatedPatternIds}
              onChange={(e) => setRelatedPatternIds(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Related Actor IDs</label>
            <input
              value={relatedActorIds}
              onChange={(e) => setRelatedActorIds(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Related CVEs</label>
            <input
              value={relatedVulnerabilityCveIds}
              onChange={(e) => setRelatedVulnerabilityCveIds(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
