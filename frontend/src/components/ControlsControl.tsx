"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ControlOption {
  key: string;
  code: string;
  name: string;
}

interface MatchResult {
  matchedControls: ControlOption[];
  suggestedNewControl: { code: string; name: string; description: string } | null;
  reasoning: string;
}

export function ControlsControl({
  obligationId,
  mapped,
  allControls,
  aiConfigured,
}: {
  obligationId: string;
  mapped: ControlOption[];
  allControls: ControlOption[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  const mappedKeys = new Set(mapped.map((c) => c.key));
  const candidates = allControls.filter((c) => !mappedKeys.has(c.key));

  async function handleMap() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/obligations/${obligationId}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlKey: selected }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't map.");
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleUnmap(controlKey: string) {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/compliance/obligations/${obligationId}/controls/${controlKey}/remove`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleMatch() {
    setError(null);
    setPending(true);
    setMatchResult(null);
    try {
      const response = await fetch(`/api/compliance/obligations/${obligationId}/match-controls`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't match against the control library.");
        return;
      }
      const result = (await response.json()) as MatchResult;
      setMatchResult(result);
      if (result.matchedControls.length > 0) {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      {mapped.length === 0 ? (
        <p className="text-sm text-text-muted">No controls mapped yet.</p>
      ) : (
        <div className="space-y-1">
          {mapped.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
              <a href={`/compliance/controls/${c.key}`} className="text-text-primary hover:underline">
                {c.code} — {c.name}
              </a>
              <button onClick={() => handleUnmap(c.key)} disabled={pending} className="text-xs text-text-muted hover:text-danger">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.length > 0 && (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            >
              <option value="">Map to a control…</option>
              {candidates.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleMap}
              disabled={!selected || pending}
              className="rounded bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Map
            </button>
          </>
        )}
        {aiConfigured && (
          <button
            onClick={handleMatch}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-sm text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            {pending ? "Matching…" : "Match with AI"}
          </button>
        )}
      </div>

      {matchResult && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">{matchResult.reasoning}</p>
          {matchResult.matchedControls.length > 0 && (
            <p className="mt-2 text-xs text-ok">
              Matched: {matchResult.matchedControls.map((c) => c.code).join(", ")} (already applied above)
            </p>
          )}
          {matchResult.suggestedNewControl && (
            <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-2">
              <p className="text-xs font-medium text-text-primary">
                Suggested new control: {matchResult.suggestedNewControl.code} — {matchResult.suggestedNewControl.name}
              </p>
              <p className="mt-1 text-xs text-text-muted">{matchResult.suggestedNewControl.description}</p>
              <p className="mt-1 text-xs text-text-muted">
                Not created automatically —{" "}
                <a href="/compliance/controls/new" className="underline">
                  create it
                </a>{" "}
                if you agree, then map this obligation to it.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
