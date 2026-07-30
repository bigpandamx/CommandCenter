"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationProfile } from "../lib/adminApiClient";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export function ProfileCard({
  organizationId,
  profile,
}: {
  organizationId: string;
  profile: OrganizationProfile;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    primaryContactName: profile.primaryContactName,
    primaryContactEmail: profile.primaryContactEmail,
    primaryContactPhone: profile.primaryContactPhone ?? "",
    industry: profile.industry ?? "",
    companySize: profile.companySize ?? "",
    website: profile.website ?? "",
    country: profile.country ?? "",
    notes: profile.notes ?? "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch(`/api/organizations/${organizationId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save the profile.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Profile</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Edit
          </button>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Slug" value={profile.slug} mono />
          <Row label="Contact" value={profile.primaryContactName} />
          <Row label="Email" value={profile.primaryContactEmail} mono />
          <Row label="Phone" value={profile.primaryContactPhone} />
          <Row label="Industry" value={profile.industry} />
          <Row label="Company size" value={profile.companySize} />
          <Row label="Website" value={profile.website} mono />
          <Row label="Country" value={profile.country} />
          {profile.notes && (
            <div>
              <dt className="text-xs text-text-muted">Notes</dt>
              <dd className="mt-0.5 text-text-primary">{profile.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Edit profile</p>
      <div className="mt-3 space-y-3">
        <EditField label="Contact name">
          <input
            value={form.primaryContactName}
            onChange={(e) => update("primaryContactName", e.target.value)}
            className={inputClass}
          />
        </EditField>
        <EditField label="Contact email">
          <input
            type="email"
            value={form.primaryContactEmail}
            onChange={(e) => update("primaryContactEmail", e.target.value)}
            className={inputClass}
          />
        </EditField>
        <EditField label="Contact phone">
          <input
            value={form.primaryContactPhone}
            onChange={(e) => update("primaryContactPhone", e.target.value)}
            className={inputClass}
          />
        </EditField>
        <EditField label="Industry">
          <input value={form.industry} onChange={(e) => update("industry", e.target.value)} className={inputClass} />
        </EditField>
        <EditField label="Company size">
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
        </EditField>
        <EditField label="Website">
          <input value={form.website} onChange={(e) => update("website", e.target.value)} className={inputClass} />
        </EditField>
        <EditField label="Country">
          <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputClass} />
        </EditField>
        <EditField label="Notes">
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} className={inputClass} />
        </EditField>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ok px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary outline-none focus-visible:border-ok";

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      {children}
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""} text-text-primary`}>{value ?? "—"}</dd>
    </div>
  );
}
