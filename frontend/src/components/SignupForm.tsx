"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export function SignupForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationName: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    industry: "",
    companySize: "",
    website: "",
    country: "",
    notes: "",
    slug: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Strip empty-string optional fields rather than sending them --
    // an empty string for e.g. `slug` would otherwise short-circuit the
    // server's auto-generation logic (empty string is truthy-checked
    // differently than "field absent" in JS, easy to get wrong either
    // direction, so being explicit here beats relying on the server to
    // paper over it).
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value.trim() !== ""),
    );

    const response = await fetch("/api/organizations/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create the organization.");
      return;
    }

    const result = await response.json();
    router.push(`/organizations/${result.organization.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <fieldset className="rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
          Organization
        </legend>
        <div className="space-y-3">
          <Field label="Organization name" required>
            <input
              required
              value={form.organizationName}
              onChange={(e) => update("organizationName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Custom slug (optional -- auto-generated from the name if left blank)">
            <input value={form.slug} onChange={(e) => update("slug", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
          Primary contact
        </legend>
        <div className="space-y-3">
          <Field label="Contact name" required>
            <input
              required
              value={form.primaryContactName}
              onChange={(e) => update("primaryContactName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Contact email" required>
            <input
              required
              type="email"
              value={form.primaryContactEmail}
              onChange={(e) => update("primaryContactEmail", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.primaryContactPhone}
              onChange={(e) => update("primaryContactPhone", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
          Company details (optional)
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Industry">
            <input value={form.industry} onChange={(e) => update("industry", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Company size">
            <select
              value={form.companySize}
              onChange={(e) => update("companySize", e.target.value)}
              className={inputClass}
            >
              <option value="">Unspecified</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={(e) => update("website", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Country">
            <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ok px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create organization"}
        </button>
        <p className="text-xs text-text-muted">Starts on the trial tier. Upgrade from the organization page afterward.</p>
      </div>
    </form>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      {required && <span className="text-danger"> *</span>}
      {children}
    </label>
  );
}
