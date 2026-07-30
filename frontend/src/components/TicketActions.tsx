"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, TicketComment, TicketStatus, StaffUserSummary } from "../lib/adminApiClient";

const STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];

/**
 * Deliberately does NOT replicate Control-Plane/Tickets's status
 * transition state machine here -- every status is always offered, and
 * an invalid transition (e.g. resolved -> waiting_on_customer) comes
 * back as a 409 from the server and is shown as an error. Duplicating
 * the transition rules client-side would mean two places that can drift
 * out of sync; the backend is the single source of truth for what's
 * valid.
 */
export function TicketActions({
  ticketId,
  ticket,
  comments,
  staff,
}: {
  ticketId: string;
  ticket: Ticket;
  comments: TicketComment[];
  staff: StaffUserSummary[];
}) {
  const router = useRouter();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigneeInput, setAssigneeInput] = useState(ticket.assignedToStaffId ?? "");
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

  async function handleStatusChange(status: TicketStatus) {
    setStatusError(null);
    const response = await fetch(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatusError(body.error ?? "Couldn't change status.");
      return;
    }
    router.refresh();
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    const response = await fetch(`/api/tickets/${ticketId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: assigneeInput.trim() || null }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setAssignError(body.error ?? "Couldn't assign the ticket.");
      return;
    }
    router.refresh();
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    setCommentError(null);

    const response = await fetch(`/api/tickets/${ticketId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });

    setSubmittingComment(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setCommentError(body.error ?? "Couldn't add the comment.");
      return;
    }

    setCommentBody("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Status</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleStatusChange(s)}
              disabled={s === ticket.status}
              className={`rounded border px-2.5 py-1 text-xs ${
                s === ticket.status
                  ? "border-ok bg-ok/10 text-ok"
                  : "border-border text-text-muted hover:border-ok/50 hover:text-text-primary"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {statusError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {statusError}
          </p>
        )}
      </div>

      <form onSubmit={handleAssign} className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Assignee</p>
        <div className="mt-2 flex items-center gap-2">
          {staff.length > 0 ? (
            <select
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              className="flex-1 rounded border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary outline-none focus-visible:border-ok"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email} ({s.role}){s.status === "disabled" ? " -- disabled" : ""}
                </option>
              ))}
            </select>
          ) : (
            // Fallback for the (unlikely) case the staff directory comes
            // back empty -- still lets an assignment happen by ID rather
            // than blocking on it, but this shouldn't be the normal path.
            <input
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              placeholder="staff user id (directory unavailable)"
              className="flex-1 rounded border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none focus-visible:border-ok"
            />
          )}
          <button
            type="submit"
            className="rounded bg-ok px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-90"
          >
            Save
          </button>
        </div>
        {assignError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {assignError}
          </p>
        )}
      </form>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Comments</p>

        <div className="mt-3 space-y-3">
          {comments.length === 0 && <p className="text-sm text-text-muted">No comments yet.</p>}
          {comments.map((c) => {
            const author = staff.find((s) => s.id === c.authorStaffId);
            return (
              <div key={c.id} className="rounded border border-border p-3 text-sm">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{author?.email ?? c.authorStaffId ?? "system"}</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-text-primary">{c.body}</p>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleComment} className="mt-4">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            placeholder="Add a comment…"
            className="w-full rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
          />
          {commentError && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {commentError}
            </p>
          )}
          <button
            type="submit"
            disabled={submittingComment}
            className="mt-2 rounded bg-ok px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
          >
            {submittingComment ? "Posting…" : "Post comment"}
          </button>
        </form>
      </div>
    </div>
  );
}
