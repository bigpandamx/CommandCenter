"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "draft" | "active" | "retired";

export function PolicyStatusControl({ policyKey, status }: { policyKey: string; status: Status }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetStatus(newStatus: Status) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/governance/policies/${policyKey}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't update status.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status !== "active" && (
          <button
            onClick={() => handleSetStatus("active")}
            disabled={pending}
            className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Activate
          </button>
        )}
        {status !== "draft" && (
          <button
            onClick={() => handleSetStatus("draft")}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            Back to Draft
          </button>
        )}
        {status !== "retired" && (
          <button
            onClick={() => handleSetStatus("retired")}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Retire
          </button>
        )}
      </div>
    </div>
  );
}
