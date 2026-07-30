"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunJobButton({ jobKey, label = "Run Now" }: { jobKey: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobKey)}/run`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't start the job.");
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
        className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
