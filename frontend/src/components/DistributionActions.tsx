"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Announcement } from "../lib/adminApiClient";

function tomorrowAt9am(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function DistributionActions({ announcement, orgName }: { announcement: Announcement; orgName?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOnly, setInternalOnly] = useState(announcement.audience === "staff");
  const [customDate, setCustomDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  async function applyAudienceIfChanged(): Promise<boolean> {
    const wantsAudience = internalOnly ? "staff" : "customers";
    if (announcement.audience === wantsAudience) return true;
    const response = await fetch(`/api/announcements/${announcement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: wantsAudience }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "Couldn't update audience.");
      return false;
    }
    return true;
  }

  async function runAction(action: () => Promise<Response>) {
    setError(null);
    setBusy(true);
    try {
      const audienceOk = await applyAudienceIfChanged();
      if (!audienceOk) return;
      const response = await action();
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "That didn't work.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function publishNow() {
    return runAction(() => fetch(`/api/announcements/${announcement.id}/publish`, { method: "POST" }));
  }

  function publishTomorrow() {
    return runAction(() =>
      fetch(`/api/announcements/${announcement.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishAt: tomorrowAt9am() }),
      }),
    );
  }

  function scheduleCustom() {
    if (!customDate) return;
    return runAction(() =>
      fetch(`/api/announcements/${announcement.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishAt: new Date(customDate).toISOString() }),
      }),
    );
  }

  function handleUnschedule() {
    return runAction(() => fetch(`/api/announcements/${announcement.id}/unschedule`, { method: "POST" }));
  }

  if (announcement.status !== "draft") {
    return null; // nothing left to distribute -- already published or archived
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div>
        <p className="text-sm text-text-primary">{announcement.title}</p>
        <p className="mt-1 text-xs text-text-muted">
          {orgName ? `Compliance alert — ${orgName}` : "General announcement"}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      {announcement.scheduledPublishAt ? (
        // Once scheduled, the timing decision has already been made --
        // showing Publish Immediately/Tomorrow/Schedule alongside would
        // present contradictory actions for something already queued.
        // Only two things are meaningful here: when, and "never mind."
        <div className="mt-2 flex items-center justify-between rounded border border-border px-2 py-1.5">
          <p className="text-xs text-text-primary">
            Scheduled for {new Date(announcement.scheduledPublishAt).toLocaleString()}
          </p>
          <button type="button" onClick={handleUnschedule} disabled={busy} className="text-xs text-text-muted hover:text-danger">
            Unschedule
          </button>
        </div>
      ) : (
        <>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={internalOnly}
              onChange={(e) => setInternalOnly(e.target.checked)}
              disabled={busy}
              className="rounded border-border"
            />
            Internal Only — don&rsquo;t send to the customer
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={publishNow}
              disabled={busy}
              className="rounded bg-ok px-2.5 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Publish Immediately"}
            </button>
            <button
              type="button"
              onClick={publishTomorrow}
              disabled={busy}
              className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-primary-500 disabled:opacity-50"
            >
              Tomorrow
            </button>
            {showCustomPicker ? (
              <>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  disabled={busy}
                  className="rounded border border-border bg-canvas px-2 py-1 text-xs text-text-primary"
                />
                <button
                  type="button"
                  onClick={scheduleCustom}
                  disabled={busy || !customDate}
                  className="rounded bg-primary-600 px-2.5 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Confirm schedule
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowCustomPicker(true)}
                disabled={busy}
                className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-primary-500 disabled:opacity-50"
              >
                Schedule…
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
