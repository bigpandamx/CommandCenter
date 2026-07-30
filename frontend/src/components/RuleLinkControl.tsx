"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RuleOption {
  key: string;
  name: string;
}

export function RuleLinkControl({
  updateId,
  linkedRule,
  allRules,
}: {
  updateId: string;
  linkedRule: RuleOption | null;
  allRules: RuleOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLink() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/rules/${selected}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't link.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleUnlink() {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/compliance/updates/${updateId}/unlink`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (linkedRule) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-lg border border-primary-500/40 bg-primary-500/5 px-3 py-2">
        <p className="text-sm text-text-primary">
          Part of{" "}
          <a href={`/compliance/rules/${linkedRule.key}`} className="underline">
            {linkedRule.name}
          </a>
        </p>
        <button onClick={handleUnlink} disabled={pending} className="text-xs text-text-muted hover:text-danger">
          Unlink
        </button>
      </div>
    );
  }

  if (allRules.length === 0) return null;

  return (
    <div className="mt-4">
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
        >
          <option value="">Link to a rule…</option>
          {allRules.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleLink}
          disabled={!selected || pending}
          className="rounded bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          Link
        </button>
      </div>
    </div>
  );
}
