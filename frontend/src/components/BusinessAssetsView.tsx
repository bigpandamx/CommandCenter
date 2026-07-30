"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BusinessAssetLike {
  id: string;
  name: string;
  description: string;
  category: string;
  criticality: "low" | "medium" | "high" | "critical";
  isActive: boolean;
}

const CRITICALITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

function ToggleAssetButton({ assetId, isActive }: { assetId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await fetch(`/api/business-assets/${encodeURIComponent(assetId)}/${isActive ? "deactivate" : "reactivate"}`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
    >
      {pending ? "…" : isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}

function CreateAssetForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [criticality, setCriticality] = useState<BusinessAssetLike["criticality"]>("medium");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/business-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, category, criticality }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't record that asset.");
        return;
      }
      setName("");
      setDescription("");
      setCategory("");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-text-muted hover:text-text-primary">
        + Record an asset
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded border border-border bg-surface-raised p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer Database"
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="database, api, system…"
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
        <select
          value={criticality}
          onChange={(e) => setCriticality(e.target.value as BusinessAssetLike["criticality"])}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="What this is, and why it matters…"
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !name.trim() || !description.trim() || !category.trim()}
          className="rounded border border-border px-3 py-1.5 text-xs text-text-primary hover:border-primary-500 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text-primary">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

export function BusinessAssetsView({ organizationId, assets }: { organizationId: string; assets: BusinessAssetLike[] }) {
  const active = assets.filter((a) => a.isActive);
  const inactive = assets.filter((a) => !a.isActive);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Business Assets</p>
      <p className="mt-1 text-xs text-text-muted">
        What this organization has that can be at risk -- a private inventory, not a shared catalog.
      </p>

      {assets.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No assets recorded yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {active.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${CRITICALITY_STYLES[asset.criticality]}`}>{asset.criticality}</span>
                  <span className="text-xs text-text-muted">{asset.category}</span>
                  <span className="text-sm text-text-primary">{asset.name}</span>
                </div>
                <p className="mt-0.5 text-xs text-text-muted">{asset.description}</p>
              </div>
              <ToggleAssetButton assetId={asset.id} isActive={asset.isActive} />
            </div>
          ))}
          {inactive.length > 0 && (
            <>
              <p className="pt-2 text-xs text-text-muted">Deactivated</p>
              {inactive.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-2 opacity-60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{asset.category}</span>
                      <span className="text-sm text-text-primary">{asset.name}</span>
                    </div>
                  </div>
                  <ToggleAssetButton assetId={asset.id} isActive={asset.isActive} />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="mt-3">
        <CreateAssetForm organizationId={organizationId} />
      </div>
    </div>
  );
}
