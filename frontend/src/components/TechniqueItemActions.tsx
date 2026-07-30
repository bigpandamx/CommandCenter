"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TechniqueItemActions({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/threat-intel/techniques/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't update.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={handleToggle}
        disabled={pending}
        className="rounded border border-border px-2 py-0.5 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
      >
        {isActive ? "Mark Inactive" : "Mark Active"}
      </button>
    </div>
  );
}
