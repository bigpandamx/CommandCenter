"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "cloud", label: "Cloud" },
  { value: "ai", label: "AI" },
  { value: "device", label: "Device" },
] as const;

const SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export function ReportOutageForm() {
  const router = useRouter();
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("ai");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]["value"]>("high");
  const [affectedServices, setAffectedServices] = useState("");
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [sourceUrl, setSourceUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/risk-intelligence/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          category,
          title,
          description,
          severity,
          affectedServices: affectedServices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          startedAt: new Date(startedAt).toISOString(),
          sourceUrl: sourceUrl.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? body.error ?? "Couldn't record that outage.");
        return;
      }
      router.push(`/risk-intelligence/outages/${encodeURIComponent(body.outage.id)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="vendor">
            Vendor
          </label>
          <input
            id="vendor"
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="openai"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
          <p className="mt-1 text-xs text-text-muted">The same vendor identifier organizations disclose in their own profile.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number]["value"])}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chat Completions API degraded"
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
          placeholder="What's happening…"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="severity">
            Severity
          </label>
          <select
            id="severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number]["value"])}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="startedAt">
            Started at
          </label>
          <input
            id="startedAt"
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="affectedServices">
          Affected services
        </label>
        <input
          id="affectedServices"
          type="text"
          value={affectedServices}
          onChange={(e) => setAffectedServices(e.target.value)}
          placeholder="Chat Completions API, Embeddings API"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <p className="mt-1 text-xs text-text-muted">Comma-separated.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="sourceUrl">
          Source URL (optional)
        </label>
        <input
          id="sourceUrl"
          type="text"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://status.openai.com/incidents/…"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !vendor.trim() || !title.trim() || !description.trim()}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Reporting…" : "Report outage"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
