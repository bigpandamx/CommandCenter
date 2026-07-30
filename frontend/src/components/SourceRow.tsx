"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Source {
  id: string;
  name: string;
  jurisdiction: string;
  sourceType: "rss" | "atom" | "json_api" | "manual";
  isActive: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: "never_run" | "success" | "error";
  lastFetchError: string | null;
  scheduleIntervalMinutes: number | null;
}

export function SourceRow({ source }: { source: Source }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleInput, setScheduleInput] = useState(source.scheduleIntervalMinutes?.toString() ?? "");
  const [retryResult, setRetryResult] = useState<string | null>(null);

  async function handleToggleActive() {
    setError(null);
    setPending(true);
    try {
      const url = `/api/compliance/sources/${source.id}${source.isActive ? "" : "/activate"}`;
      const response = await fetch(url, { method: source.isActive ? "DELETE" : "POST" });
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

  async function handleRetry() {
    setError(null);
    setRetryResult(null);
    setPending(true);
    try {
      const response = await fetch(`/api/compliance/sources/${source.id}/retry`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Retry failed.");
        return;
      }
      setRetryResult(
        body.status === "success"
          ? `Success -- ${body.summary?.inserted ?? 0} new, ${body.summary?.duplicate ?? 0} duplicate.`
          : `Failed: ${body.error}`,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSaveSchedule() {
    setError(null);
    setPending(true);
    try {
      const minutes = scheduleInput.trim() === "" ? null : Number(scheduleInput);
      const response = await fetch(`/api/compliance/sources/${source.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleIntervalMinutes: minutes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't save schedule.");
        return;
      }
      setEditingSchedule(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${source.isActive ? "bg-ok" : "bg-text-muted"}`} />
            <p className="text-sm text-text-primary">{source.name}</p>
            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">{source.sourceType}</span>
          </div>
          <p className="mt-1 text-xs text-text-muted">{source.jurisdiction}</p>
        </div>
        <div className="flex gap-2">
          {source.sourceType === "manual" && (
            <a
              href={`/compliance/sources/${source.id}/manual-update`}
              className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised"
            >
              Add Update
            </a>
          )}
          {source.sourceType !== "manual" && (
            <button
              onClick={handleRetry}
              disabled={pending || !source.isActive}
              className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
            >
              Retry
            </button>
          )}
          <button
            onClick={handleToggleActive}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-50"
          >
            {source.isActive ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {retryResult && <p className="mt-2 text-xs text-text-muted">{retryResult}</p>}

      {source.sourceType !== "manual" && (
        <p className="mt-2 text-xs text-text-muted">
          Last fetch:{" "}
          {source.lastFetchStatus === "never_run" ? (
            "never run"
          ) : source.lastFetchStatus === "success" ? (
            <span className="text-ok">success{source.lastFetchedAt ? ` at ${new Date(source.lastFetchedAt).toLocaleString()}` : ""}</span>
          ) : (
            <span className="text-danger">error{source.lastFetchError ? `: ${source.lastFetchError}` : ""}</span>
          )}
        </p>
      )}

      <div className="mt-2">
        {editingSchedule ? (
          <div className="flex items-center gap-2">
            <input
              value={scheduleInput}
              onChange={(e) => setScheduleInput(e.target.value)}
              placeholder="minutes"
              className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
            />
            <button onClick={handleSaveSchedule} disabled={pending} className="text-xs text-primary-600 hover:underline">
              Save
            </button>
            <button onClick={() => setEditingSchedule(false)} className="text-xs text-text-muted hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingSchedule(true)} className="text-xs text-text-muted hover:underline">
            Schedule: {source.scheduleIntervalMinutes ? `every ${source.scheduleIntervalMinutes}m` : "not set"} (edit)
          </button>
        )}
      </div>
    </div>
  );
}
