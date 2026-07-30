"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrollmentToken } from "../lib/adminApiClient";
import { IdChip } from "./IdChip";
import { StatusDot } from "./StatusDot";

function tokenStatus(token: EnrollmentToken): string {
  if (new Date(token.expiresAt).getTime() <= Date.now()) return "expired";
  if (token.useCount >= token.maxUses) return "expired";
  return "active";
}

export function EnrollmentTokenList({
  organizationId,
  tokens,
}: {
  organizationId: string;
  tokens: EnrollmentToken[];
}) {
  const router = useRouter();
  const [issuing, setIssuing] = useState(false);
  const [justIssued, setJustIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIssue() {
    setIssuing(true);
    setError(null);
    const response = await fetch(`/api/organizations/${organizationId}/enrollment-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setIssuing(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't issue a token.");
      return;
    }
    const token = await response.json();
    setJustIssued(token.token);
    router.refresh();
  }

  async function handleRevoke(token: string) {
    await fetch(`/api/enrollment-tokens/${encodeURIComponent(token)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Enrollment tokens</p>
        <button
          type="button"
          onClick={handleIssue}
          disabled={issuing}
          className="rounded bg-ok px-2.5 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {issuing ? "Issuing…" : "Issue token"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      {justIssued && (
        <div className="mt-3 rounded border border-ok/40 bg-ok/10 p-3 text-xs">
          <p className="text-text-primary">
            New token -- shown once, hand this to whoever is installing Aegis:
          </p>
          <p className="mt-1 select-all break-all font-mono text-ok">{justIssued}</p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {tokens.length === 0 && <p className="text-sm text-text-muted">No enrollment tokens yet.</p>}
        {tokens.map((t) => {
          const status = tokenStatus(t);
          return (
            <div
              key={t.token}
              className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <IdChip value={t.token} prefixChars={10} />
                <StatusDot status={status}>{status}</StatusDot>
                <span className="text-xs text-text-muted">
                  {t.useCount}/{t.maxUses} used
                </span>
              </div>
              {status === "active" && (
                <button
                  type="button"
                  onClick={() => handleRevoke(t.token)}
                  className="text-xs text-danger hover:underline"
                >
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
