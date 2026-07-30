"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateAnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"staff" | "customers" | "all">("staff");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        audience,
        severity,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const responseBody = await response.json().catch(() => ({}));
      setError(responseBody.error ?? "Couldn't create the announcement.");
      return;
    }

    router.push("/announcements");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-muted">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          className="w-full rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-text-muted">Audience</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            className="w-full rounded border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
          >
            <option value="staff">Staff only</option>
            <option value="customers">Customers only</option>
            <option value="all">Staff and customers</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="mb-1 block text-xs text-text-muted">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
            className="w-full rounded border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-muted">Expires (optional)</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="rounded border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save as draft"}
      </button>
      <p className="text-xs text-text-muted">
        Saved as a draft first -- publish it separately once you're ready for people to see it.
      </p>
    </form>
  );
}
