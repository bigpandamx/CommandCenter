"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "pending_review" | "approved" | "rejected";

interface Sibling {
  id: string;
  description: string;
}

export function ObligationReviewActions({
  obligationId,
  status,
  confidence,
  description,
  obligationType,
  deadlineDescription,
  siblings,
}: {
  obligationId: string;
  status: Status;
  confidence: number | null;
  description: string;
  obligationType: string;
  deadlineDescription: string | null;
  siblings: Sibling[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(description);
  const [editType, setEditType] = useState(obligationType);
  const [editDeadline, setEditDeadline] = useState(deadlineDescription ?? "");
  const [mergeTarget, setMergeTarget] = useState("");

  async function handleAction(action: string, body?: unknown) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/obligations/${obligationId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const respBody = await response.json().catch(() => ({}));
        setError(respBody.message ?? "Couldn't update.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Status: <span className="text-text-primary">{status.replace("_", " ")}</span>
          {confidence !== null && <span> · Confidence: {confidence}%</span>}
        </p>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {editing ? (
        <div className="mt-2 space-y-2 rounded border border-border bg-surface p-3">
          <div>
            <label className="block text-xs font-medium text-text-muted">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Type</label>
            <input
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted">Deadline</label>
            <input
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
              placeholder="within 90 days of the effective date"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                handleAction("edit", {
                  description: editDescription,
                  obligationType: editType,
                  deadlineDescription: editDeadline.trim() === "" ? null : editDeadline,
                })
              }
              disabled={pending}
              className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-text-muted hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {status !== "approved" && (
            <button
              onClick={() => handleAction("approve")}
              disabled={pending}
              className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {status !== "rejected" && (
            <button
              onClick={() => handleAction("reject")}
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Reject
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            Edit
          </button>
          {status !== "pending_review" && (
            <button
              onClick={() => handleAction("reset")}
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {siblings.length > 0 && !editing && (
        <div className="mt-2 flex gap-2">
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
          >
            <option value="">Merge into…</option>
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.description}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleAction("merge", { targetObligationId: mergeTarget })}
            disabled={!mergeTarget || pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
}
