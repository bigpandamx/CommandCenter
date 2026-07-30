"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const IOC_TYPES = ["ip", "domain", "url", "email", "file_hash_md5", "file_hash_sha1", "file_hash_sha256"] as const;

const IOC_TYPE_LABELS: Record<(typeof IOC_TYPES)[number], string> = {
  ip: "IP Address",
  domain: "Domain",
  url: "URL",
  email: "Email Address",
  file_hash_md5: "File Hash (MD5)",
  file_hash_sha1: "File Hash (SHA1)",
  file_hash_sha256: "File Hash (SHA256)",
};

export function SubmitIocForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [iocType, setIocType] = useState<(typeof IOC_TYPES)[number]>("ip");
  const [value, setValue] = useState("");
  const [threatType, setThreatType] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value.trim()) {
      setError("A value is required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/threat-intel/iocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iocType,
          value: value.trim(),
          threatType: threatType.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't add the indicator.");
        return;
      }
      setValue("");
      setThreatType("");
      setDescription("");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
        Add Indicator
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-surface p-3">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div>
        <label className="block text-xs font-medium text-text-muted">Type</label>
        <select
          value={iocType}
          onChange={(e) => setIocType(e.target.value as (typeof IOC_TYPES)[number])}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
        >
          {IOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {IOC_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Value</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 font-mono text-sm text-text-primary"
          placeholder="e.g. 203.0.113.5, evil.example, a1b2c3..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Threat Type (optional)</label>
        <input
          value={threatType}
          onChange={(e) => setThreatType(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          placeholder="e.g. botnet C2, phishing infrastructure"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
