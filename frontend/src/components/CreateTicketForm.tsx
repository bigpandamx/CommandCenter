"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["bug", "billing", "compliance", "account", "technical_support", "feature_request", "other"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TEAMS = ["engineering", "support"] as const;

export function CreateTicketForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationId: "",
    subject: "",
    description: "",
    category: "bug" as (typeof CATEGORIES)[number],
    priority: "" as "" | (typeof PRIORITIES)[number],
    team: "" as "" | (typeof TEAMS)[number],
    reporterName: "",
    reporterEmail: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ""),
    );

    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create the ticket.");
      return;
    }

    const ticket = await response.json();
    router.push(`/tickets/${ticket.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <Field label="Subject" required>
        <input
          required
          value={form.subject}
          onChange={(e) => update("subject", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Description" required>
        <textarea
          required
          rows={5}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Category" required>
          <select
            value={form.category}
            onChange={(e) => update("category", e.target.value as (typeof CATEGORIES)[number])}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority (default: medium)">
          <select
            value={form.priority}
            onChange={(e) => update("priority", e.target.value as typeof form.priority)}
            className={inputClass}
          >
            <option value="">Default</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team override">
          <select
            value={form.team}
            onChange={(e) => update("team", e.target.value as typeof form.team)}
            className={inputClass}
          >
            <option value="">Auto (by category)</option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Organization ID (optional -- leave blank for an internal-only ticket)">
        <input
          value={form.organizationId}
          onChange={(e) => update("organizationId", e.target.value)}
          placeholder="uuid"
          className={`${inputClass} font-mono`}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reporter name">
          <input
            value={form.reporterName}
            onChange={(e) => update("reporterName", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Reporter email">
          <input
            type="email"
            value={form.reporterEmail}
            onChange={(e) => update("reporterEmail", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-ok px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create ticket"}
      </button>
    </form>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      {required && <span className="text-danger"> *</span>}
      {children}
    </label>
  );
}
