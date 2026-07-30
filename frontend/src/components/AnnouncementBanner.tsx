"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Announcement } from "../lib/adminApiClient";

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-border bg-surface text-text-primary",
  warning: "border-warn bg-warn/10 text-text-primary",
  critical: "border-danger bg-danger/10 text-text-primary",
};

/**
 * `announcements` is already filtered server-side to "active AND not
 * yet acknowledged by this staff member" (see
 * listUnacknowledgedAnnouncementsForStaff) -- dismissing here just
 * needs to record the ack and hide it locally, not do any filtering
 * itself. Dismissed announcements stay visible to every OTHER staff
 * member who hasn't seen them yet; this is per-viewer state, not
 * archiving the announcement.
 *
 * Hides optimistically (removes from local state immediately) rather
 * than waiting on the request -- a dismiss that fails is low-stakes
 * (the announcement just reappears on the next page load, since the
 * server-side filter didn't actually change) and a banner that lingers
 * for a network round-trip after someone's already dismissed it feels
 * broken.
 */
export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visible = announcements.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;

  async function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
    const response = await fetch(`/api/announcements/${id}/acknowledge`, { method: "POST" });
    if (!response.ok) {
      // The optimistic hide already happened -- on the next real
      // navigation, router.refresh() will re-fetch the server-filtered
      // list and the announcement will correctly reappear if the ack
      // didn't actually land, rather than silently staying dismissed.
      router.refresh();
    }
  }

  return (
    <div className="space-y-2 border-b border-border bg-canvas px-6 py-3">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm ${SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info}`}
        >
          <div>
            <span className="font-medium">{a.title}</span>
            <span className="mx-2 text-text-muted">—</span>
            <span className="text-text-muted">{a.body}</span>
          </div>
          <button
            type="button"
            onClick={() => handleDismiss(a.id)}
            className="shrink-0 text-xs text-text-muted hover:text-text-primary"
            aria-label={`Dismiss "${a.title}"`}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
