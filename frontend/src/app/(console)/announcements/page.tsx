import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { searchAnnouncements } from "../../../lib/adminApiClient";
import { AnnouncementStatusBadge, AnnouncementSeverityBadge } from "../../../components/AnnouncementBadges";
import { AnnouncementRowActions } from "../../../components/AnnouncementRowActions";

export default async function AnnouncementsPage() {
  const config = await requireSession();
  const { announcements } = await searchAnnouncements(config);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Announcements</h1>
        </div>
        <Link
          href="/announcements/new"
          className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90"
        >
          New announcement
        </Link>
      </div>

      {announcements.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No announcements yet. Published ones for the "staff" or "all" audience show as a banner above every page
          in this console; "customers"-audience ones are meant for Aegis to pull and show its own users, once that
          integration is wired up (see CUTOVER.md).
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Audience</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{a.title}</p>
                    <p className="mt-0.5 max-w-md truncate text-xs text-text-muted">{a.body}</p>
                  </td>
                  <td className="px-4 py-3">
                    <AnnouncementStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <AnnouncementSeverityBadge severity={a.severity} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{a.audience}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {new Date(a.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <AnnouncementRowActions announcement={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
