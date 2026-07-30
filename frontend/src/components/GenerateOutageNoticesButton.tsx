"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateOutageNoticesButton({ outageId }: { outageId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/outages/${encodeURIComponent(outageId)}/generate-notices`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? body.error ?? "Couldn't generate notices.");
        return;
      }
      setResult(Array.isArray(body.announcements) ? body.announcements.length : 0);
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
        {pending ? "…" : "Generate customer notices"}
      </button>
      {result !== null && (
        <p className="mt-1 text-xs text-text-muted">
          {result} notice{result === 1 ? "" : "s"} sent to organizations that use this vendor.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
