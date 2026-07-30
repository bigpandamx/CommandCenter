"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ThreatPatternItemActions({
  id,
  isActive,
  isFalsePositive,
  verifiedByAnalyst,
}: {
  id: string;
  isActive: boolean;
  isFalsePositive: boolean;
  verifiedByAnalyst: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisoryResult, setAdvisoryResult] = useState<string | null>(null);

  async function runAction(fn: () => Promise<{ ok: boolean; json: () => Promise<any> }>) {
    setError(null);
    setPending(true);
    try {
      const response = await fn();
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleVerify() {
    await runAction(() => fetch(`/api/threat-intel/patterns/${id}/verify`, { method: "POST" }));
  }

  async function handleFalsePositive() {
    await runAction(() => fetch(`/api/threat-intel/patterns/${id}/false-positive`, { method: "POST" }));
  }

  async function handleToggleActive() {
    await runAction(() =>
      fetch(`/api/threat-intel/patterns/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      }),
    );
  }

  async function handleGenerateAdvisory() {
    setError(null);
    setAdvisoryResult(null);
    setPending(true);
    try {
      const response = await fetch(`/api/threat-intel/patterns/${id}/generate-advisory`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't generate advisory.");
        return;
      }
      setAdvisoryResult("Advisory published.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {advisoryResult && <p className="text-xs text-ok">{advisoryResult}</p>}
      <div className="flex flex-wrap gap-2">
        {!verifiedByAnalyst && !isFalsePositive && (
          <button
            onClick={handleVerify}
            disabled={pending}
            className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Verify
          </button>
        )}
        {!isFalsePositive && (
          <button
            onClick={handleFalsePositive}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            False Positive
          </button>
        )}
        <button
          onClick={handleToggleActive}
          disabled={pending}
          className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </button>
        {verifiedByAnalyst && (
          <button
            onClick={handleGenerateAdvisory}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            Generate Advisory
          </button>
        )}
      </div>
    </div>
  );
}
