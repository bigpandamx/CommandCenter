"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Announcement } from "../lib/adminApiClient";

export function AnnouncementRowActions({ announcement }: { announcement: Announcement }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setError(null);
    setBusy(true);
    const response = await fetch(`/api/announcements/${announcement.id}/publish`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't publish.");
      return;
    }
    router.refresh();
  }

  async function handleArchive() {
    setError(null);
    setBusy(true);
    const response = await fetch(`/api/announcements/${announcement.id}/archive`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't archive.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {announcement.status === "draft" && (
        <button
          type="button"
          onClick={handlePublish}
          disabled={busy}
          className="rounded bg-ok px-2.5 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : "Publish"}
        </button>
      )}
      {announcement.status !== "archived" && (
        <button
          type="button"
          onClick={handleArchive}
          disabled={busy}
          className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-danger/50 disabled:opacity-50"
        >
          {busy ? "…" : "Archive"}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
