"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TriggerAssessmentButton({ industry }: { industry: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/industries/${encodeURIComponent(industry)}/assess`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't run a new assessment.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "…" : "Run new assessment"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
