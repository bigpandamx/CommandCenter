"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncVulnerabilitiesButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const response = await fetch("/api/threat-intel/vulnerabilities/sync", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Sync failed -- NVD may be temporarily unavailable.");
        return;
      }
      setResult(`${body.inserted} inserted, ${body.updated} updated, ${body.failed} failed`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync Now"}
      </button>
      {result && <p className="mt-1 text-xs text-ok">{result}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
