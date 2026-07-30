"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EvidenceType = "document" | "log_reference" | "attestation" | "other";

interface Evidence {
  id: string;
  evidenceType: EvidenceType;
  description: string;
  referenceUrl: string | null;
  attachedAt: string;
}

const TYPE_LABELS: Record<EvidenceType, string> = {
  document: "Document",
  log_reference: "Log Reference",
  attestation: "Attestation",
  other: "Other",
};

export function EvidenceControl({ targetType, targetId, evidence }: { targetType: string; targetId: string; evidence: Evidence[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("attestation");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("A description is required.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/governance/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          evidenceType,
          description,
          referenceUrl: referenceUrl.trim() === "" ? null : referenceUrl,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't attach evidence.");
        return;
      }
      setDescription("");
      setReferenceUrl("");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(evidenceId: string) {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/governance/evidence/${evidenceId}/remove`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      {evidence.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing on file yet.</p>
      ) : (
        <div className="space-y-1">
          {evidence.map((e) => (
            <div key={e.id} className="rounded border border-border px-3 py-1.5 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">{TYPE_LABELS[e.evidenceType]}</span>
                  <p className="mt-1 text-text-primary">{e.description}</p>
                  {e.referenceUrl && (
                    <a href={e.referenceUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-xs text-primary-600 hover:underline">
                      {e.referenceUrl}
                    </a>
                  )}
                  <p className="mt-1 text-xs text-text-muted">{new Date(e.attachedAt).toLocaleString()}</p>
                </div>
                <button onClick={() => handleRemove(e.id)} disabled={pending} className="shrink-0 text-xs text-text-muted hover:text-danger">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <form onSubmit={handleAttach} className="mt-2 space-y-2 rounded border border-border bg-surface p-3">
          <div>
            <label className="block text-xs font-medium text-text-muted">Type</label>
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            >
              <option value="attestation">Attestation</option>
              <option value="document">Document</option>
              <option value="log_reference">Log Reference</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
              placeholder="Q3 2026 disclosure banner audit -- signed off by compliance."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Reference URL (optional)</label>
            <input
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
              placeholder="https://internal.example.com/..."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "Attaching…" : "Attach"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:underline">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
        >
          Attach Evidence
        </button>
      )}
    </div>
  );
}
