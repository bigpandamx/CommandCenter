"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Severity = "low" | "medium" | "high" | "critical";

export function ReportViolationForm({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError("A description is required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/governance/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId,
          description,
          severity,
          organizationId: organizationId.trim() === "" ? null : organizationId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't report the violation.");
        return;
      }
      setDescription("");
      setOrganizationId("");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
      >
        Report a Violation
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-surface p-3">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div>
        <label className="block text-xs font-medium text-text-muted">What happened</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="AI Chat deployed without a disclosure banner"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted">Organization ID (optional)</label>
          <input
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            placeholder="Leave blank for platform-wide"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Reporting…" : "Report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
