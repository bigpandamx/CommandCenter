"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"trial" | "standard" | "enterprise">("trial");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, entitlementTier: tier }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create the organization.");
      return;
    }

    setName("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90"
      >
        New organization
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div>
        <label htmlFor="org-name" className="block text-xs text-text-muted">
          Name
        </label>
        <input
          id="org-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-56 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>
      <div>
        <label htmlFor="org-tier" className="block text-xs text-text-muted">
          Entitlement tier
        </label>
        <select
          id="org-tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as typeof tier)}
          className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        >
          <option value="trial">trial</option>
          <option value="standard">standard</option>
          <option value="enterprise">enterprise</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm text-text-muted hover:text-text-primary"
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
