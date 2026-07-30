"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ControlOption {
  key: string;
  code: string;
  name: string;
}

export function FrameworkControlsControl({
  frameworkKey,
  required,
  allControls,
}: {
  frameworkKey: string;
  required: ControlOption[];
  allControls: ControlOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredKeys = new Set(required.map((c) => c.key));
  const candidates = allControls.filter((c) => !requiredKeys.has(c.key));

  async function handleAdd() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/frameworks/${frameworkKey}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlKey: selected }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't add.");
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(controlKey: string) {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/compliance/frameworks/${frameworkKey}/controls/${controlKey}/remove`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {required.length === 0 ? (
        <p className="text-sm text-text-muted">No controls required yet.</p>
      ) : (
        <div className="space-y-1">
          {required.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
              <a href={`/compliance/controls/${c.key}`} className="text-text-primary hover:underline">
                {c.code} — {c.name}
              </a>
              <button onClick={() => handleRemove(c.key)} disabled={pending} className="text-xs text-text-muted hover:text-danger">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
          >
            <option value="">Require a control…</option>
            {candidates.map((c) => (
              <option key={c.key} value={c.key}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selected || pending}
            className="rounded bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
