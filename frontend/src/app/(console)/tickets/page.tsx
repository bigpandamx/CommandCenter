import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "../../../lib/session";
import { searchTickets } from "../../../lib/adminApiClient";
import { IdChip } from "../../../components/IdChip";
import { TicketStatusBadge, TicketPriorityBadge } from "../../../components/TicketBadges";
import { TicketSearchBar } from "../../../components/TicketSearchBar";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    text?: string;
    status?: string;
    priority?: string;
    team?: string;
    unassigned?: string;
  }>;
}) {
  const config = await requireSession();
  const query = await searchParams;

  const { tickets } = await searchTickets(config, {
    text: query.text,
    status: query.status as Parameters<typeof searchTickets>[1]["status"],
    priority: query.priority as Parameters<typeof searchTickets>[1]["priority"],
    team: query.team as Parameters<typeof searchTickets>[1]["team"],
    unassigned: query.unassigned === "true",
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Tickets</h1>
        </div>
        <Link
          href="/tickets/new"
          className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90"
        >
          New ticket
        </Link>
      </div>

      <Suspense fallback={<div className="mb-4 h-[70px] rounded-lg border border-border bg-surface" />}>
        <TicketSearchBar />
      </Suspense>

      {tickets.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No tickets match. If nothing's been filed yet, use "New ticket" -- customer-reported problems arrive
          automatically via Aegis's backend once that integration is wired up (see CUTOVER.md).
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Team</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${t.id}`} className="text-text-primary hover:text-ok">
                      {t.subject}
                    </Link>
                    <div className="font-mono text-xs text-text-muted">
                      {t.displayId} · {t.category.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <TicketPriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{t.team}</td>
                  <td className="px-4 py-3">
                    {t.assignedToStaffId ? <IdChip value={t.assignedToStaffId} /> : (
                      <span className="text-xs text-text-muted">unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {new Date(t.updatedAt).toLocaleString()}
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
