"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScheduleEditor({
  jobKey,
  currentIntervalMinutes,
  currentEnabled,
}: {
  jobKey: string;
  currentIntervalMinutes: number | null;
  currentEnabled: boolean;
}) {
  const router = useRouter();
  const [intervalMinutes, setIntervalMinutes] = useState(currentIntervalMinutes ?? 60);
  const [enabled, setEnabled] = useState(currentEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobKey)}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes, enabled }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't save the schedule.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        Every
        <input
          type="number"
          min={1}
          value={intervalMinutes}
          onChange={(e) => setIntervalMinutes(Number(e.target.value))}
          className="w-16 rounded border border-border bg-canvas px-2 py-1 text-xs text-text-primary"
        />
        min
      </label>
      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border" />
        Enabled
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded bg-primary-600 px-2.5 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
