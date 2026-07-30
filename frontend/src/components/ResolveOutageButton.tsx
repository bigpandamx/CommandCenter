"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResolveOutageButton({ outageId }: { outageId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/outages/${encodeURIComponent(outageId)}/resolve`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't resolve this outage.");
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
        {pending ? "…" : "Mark resolved"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
