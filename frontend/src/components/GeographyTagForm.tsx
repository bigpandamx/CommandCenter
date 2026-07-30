"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GeographyTagForm({
  entityType,
  id,
  originCountry,
  targetedCountries,
}: {
  entityType: "threat-actors" | "campaigns";
  id: string;
  originCountry: string | null;
  targetedCountries: string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState(originCountry ?? "");
  const [targeted, setTargeted] = useState((targetedCountries ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const targetedList = targeted
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      const response = await fetch(`/api/threat-intel/${entityType}/${id}/geography`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCountry: origin.trim() ? origin.trim() : null,
          targetedCountries: targetedList,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't save geography.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {originCountry && <span className="text-xs text-text-muted">Origin: {originCountry}</span>}
        {targetedCountries && targetedCountries.length > 0 && (
          <span className="text-xs text-text-muted">Targets: {targetedCountries.join(", ")}</span>
        )}
        <button onClick={() => setOpen(true)} className="text-xs text-primary-600 hover:underline">
          {originCountry || (targetedCountries && targetedCountries.length > 0) ? "Edit geography" : "Tag geography"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-2 space-y-2 rounded border border-border bg-surface-raised p-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-text-muted">
        Staff-curated -- read the source&rsquo;s own description text, confirm what it actually says, and tag it here. Not
        synced from MITRE.
      </p>
      <div>
        <label className="block text-xs font-medium text-text-muted">Origin Country</label>
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="e.g. Russia"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Targeted Countries (comma-separated)</label>
        <input
          value={targeted}
          onChange={(e) => setTargeted(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="e.g. United States, Germany"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
