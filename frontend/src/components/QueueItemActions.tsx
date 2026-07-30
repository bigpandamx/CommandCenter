"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "new" | "pending_review" | "duplicate" | "rejected" | "published";

export function QueueItemActions({ updateId, status }: { updateId: string; status: Status }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: string) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/updates/${updateId}/${action}`, { method: "POST" });
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
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        {status === "pending_review" && (
          <>
            <button
              onClick={() => handleAction("publish")}
              disabled={pending}
              className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Publish
            </button>
            <button
              onClick={() => handleAction("mark-duplicate")}
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
            >
              Mark Duplicate
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {(status === "duplicate" || status === "rejected") && (
          <button
            onClick={() => handleAction("mark-pending-review")}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            Undo -- back to review
          </button>
        )}
        {status === "new" && <p className="text-xs text-text-muted">Awaiting AI analysis before review.</p>}
        {status === "published" && <p className="text-xs text-ok">Published.</p>}
      </div>
    </div>
  );
}
