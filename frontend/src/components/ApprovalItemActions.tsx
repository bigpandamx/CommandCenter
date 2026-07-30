"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalItemActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!action) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/governance/approvals/${requestId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionNotes: notes.trim() === "" ? null : notes }),
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

  if (action) {
    return (
      <div className="mt-2 space-y-2">
        {error && <p className="text-xs text-danger">{error}</p>}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes (optional)"
          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Confirm {action === "approve" ? "Approve" : "Reject"}
          </button>
          <button onClick={() => setAction(null)} className="text-xs text-text-muted hover:underline">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button onClick={() => setAction("approve")} className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700">
        Approve
      </button>
      <button onClick={() => setAction("reject")} className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised">
        Reject
      </button>
    </div>
  );
}
