"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateSourceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [frameworkTags, setFrameworkTags] = useState("");
  const [sourceType, setSourceType] = useState<"rss" | "atom" | "json_api" | "manual">("rss");
  const [url, setUrl] = useState("");
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !jurisdiction.trim() || !url.trim()) {
      setError("Name, jurisdiction, and URL are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/compliance/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          jurisdiction,
          frameworkTags: frameworkTags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          sourceType,
          url,
          scheduleIntervalMinutes: scheduleIntervalMinutes.trim() ? Number(scheduleIntervalMinutes) : undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't create the source.");
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
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="Federal Register - AI Rules"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Jurisdiction</label>
        <input
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="US-Federal"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Framework Tags</label>
        <input
          value={frameworkTags}
          onChange={(e) => setFrameworkTags(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="NIST_AI_RMF, GDPR"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Source Type</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="rss">RSS</option>
          <option value="atom">Atom</option>
          <option value="json_api">JSON API</option>
          <option value="manual">Manual (no feed -- documents entered by hand)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="https://www.federalregister.gov/api/v1/documents.json?..."
        />
        <p className="mt-1 text-xs text-text-muted">
          Still required for a manual source -- typically the regulator&rsquo;s own homepage, for reference.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Schedule (minutes between checks)</label>
        <input
          value={scheduleIntervalMinutes}
          onChange={(e) => setScheduleIntervalMinutes(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="60"
        />
        <p className="mt-1 text-xs text-text-muted">Recorded as intent -- not yet enforced by an automated scheduler.</p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Source"}
      </button>
    </form>
  );
}
