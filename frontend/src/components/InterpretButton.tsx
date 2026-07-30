"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InterpretButton({ ruleKey, historyLength }: { ruleKey: string; historyLength: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInterpret() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/rules/${ruleKey}/interpret`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't generate an interpretation.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (historyLength === 0) {
    return null;
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <button
        onClick={handleInterpret}
        disabled={pending}
        className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised disabled:opacity-50"
      >
        {pending ? "Synthesizing…" : "Regenerate Interpretation"}
      </button>
    </div>
  );
}
