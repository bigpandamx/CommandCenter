"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DistributeButton({ obligationId, affectedCount }: { obligationId: string; affectedCount: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleDistribute() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/obligations/${obligationId}/distribute`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Couldn't distribute.");
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (affectedCount === 0) {
    return null; // nothing to distribute to -- no button needed, matching computeTierProgression's own "omit, don't show an empty action" convention
  }

  return (
    <div>
      {error && <p className="mb-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {done ? (
        <p className="text-sm text-ok">
          Draft alerts created for {affectedCount} organization{affectedCount === 1 ? "" : "s"}. Review and publish from{" "}
          <a href="/announcements" className="underline">
            Announcements
          </a>
          .
        </p>
      ) : (
        <button
          onClick={handleDistribute}
          disabled={pending}
          className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "Distributing…" : `Distribute to ${affectedCount} affected organization${affectedCount === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
