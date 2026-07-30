"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ControlOption {
  key: string;
  code: string;
  name: string;
}

export function CustomerPolicyItemActions({
  policyId,
  status,
  mappedControls,
  allControls,
}: {
  policyId: string;
  status: "pending_review" | "reviewed" | "rejected";
  mappedControls: ControlOption[];
  allControls: ControlOption[];
}) {
  const router = useRouter();
  const [reviewAction, setReviewAction] = useState<"review" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedControl, setSelectedControl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mappedKeys = new Set(mappedControls.map((c) => c.key));
  const candidates = allControls.filter((c) => !mappedKeys.has(c.key));

  async function handleReviewSubmit() {
    if (!reviewAction) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/customer-policies/${policyId}/${reviewAction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes.trim() === "" ? null : notes }),
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

  async function handleAddControl() {
    if (!selectedControl) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/customer-policies/${policyId}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlKey: selectedControl }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't add control.");
        return;
      }
      setSelectedControl("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemoveControl(controlKey: string) {
    setError(null);
    setPending(true);
    try {
      await fetch(`/api/customer-policies/${policyId}/controls/${controlKey}/remove`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div>
        <p className="text-xs font-medium text-text-muted">Covers</p>
        {mappedControls.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">No controls mapped yet.</p>
        ) : (
          <div className="mt-1 space-y-1">
            {mappedControls.map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                <a href={`/compliance/controls/${c.key}`} className="text-text-primary hover:underline">
                  {c.code} — {c.name}
                </a>
                <button onClick={() => handleRemoveControl(c.key)} disabled={pending} className="text-text-muted hover:text-danger">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="mt-1.5 flex gap-2">
            <select
              value={selectedControl}
              onChange={(e) => setSelectedControl(e.target.value)}
              className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            >
              <option value="">Map a control…</option>
              {candidates.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddControl}
              disabled={!selectedControl || pending}
              className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {status === "pending_review" && (
        <div className="mt-2">
          {reviewAction ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={reviewAction === "review" ? "What does this policy cover? (optional)" : "Why is this being rejected? (optional)"}
                className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReviewSubmit}
                  disabled={pending}
                  className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Confirm {reviewAction === "review" ? "Reviewed" : "Reject"}
                </button>
                <button onClick={() => setReviewAction(null)} className="text-xs text-text-muted hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setReviewAction("review")} className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700">
                Mark Reviewed
              </button>
              <button
                onClick={() => setReviewAction("reject")}
                className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
