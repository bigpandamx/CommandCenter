import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getTicket, listStaffUsers } from "../../../../lib/adminApiClient";
import { getTechnicalSummaryOrNull, getAccountSummaryOrNull } from "../../../../lib/aegisSupportClient";
import { resolveBillingSummary } from "../../../../lib/billingSummaryResolver";
import { IdChip } from "../../../../components/IdChip";
import { TicketStatusBadge, TicketPriorityBadge } from "../../../../components/TicketBadges";
import { TicketActions } from "../../../../components/TicketActions";
import { AegisTechnicalSummaryPanel } from "../../../../components/AegisTechnicalSummaryPanel";
import { BillingSummaryPanel } from "../../../../components/BillingSummaryPanel";
import { AccountSummaryPanel } from "../../../../components/AccountSummaryPanel";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const config = await requireSession();
  const [{ ticket, comments }, { staff }] = await Promise.all([
    getTicket(config, ticketId),
    listStaffUsers(config),
  ]);

  // Only fetch once we know the org -- and only for categories where
  // Aegis-side agent health is actually relevant to triage.
  const showTechnicalContext = ticket.organizationId && (ticket.category === "bug" || ticket.category === "technical_support");
  const technicalSummaryResponse = showTechnicalContext
    ? await getTechnicalSummaryOrNull(ticket.organizationId!)
    : null;

  const showBillingContext = ticket.organizationId && ticket.category === "billing";
  const billingSummary = showBillingContext ? await resolveBillingSummary(config, ticket.organizationId!) : null;

  const showAccountContext = ticket.organizationId && ticket.category === "account";
  const accountSummaryResponse = showAccountContext ? await getAccountSummaryOrNull(ticket.organizationId!) : null;

  return (
    <div>
      <Link href="/tickets" className="text-xs text-text-muted hover:text-text-primary">
        ← Tickets
      </Link>

      <div className="mt-2 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-text-muted">{ticket.displayId}</span>
          <h1 className="text-lg font-semibold text-text-primary">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <IdChip value={ticket.id} />
          <span>{ticket.category.replace(/_/g, " ")}</span>
          <span>·</span>
          <span>{ticket.team}</span>
          <span>·</span>
          <span>filed by {ticket.source}</span>
          {ticket.organizationId && (
            <>
              <span>·</span>
              <Link href={`/organizations/${ticket.organizationId}`} className="hover:text-text-primary">
                org <IdChip value={ticket.organizationId} />
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{ticket.description}</p>
            {(ticket.reporterName || ticket.reporterEmail) && (
              <p className="mt-3 text-xs text-text-muted">
                Reported by {ticket.reporterName ?? "—"}
                {ticket.reporterEmail && ` (${ticket.reporterEmail})`}
              </p>
            )}
          </div>

          {showTechnicalContext && <AegisTechnicalSummaryPanel summary={technicalSummaryResponse?.technical ?? null} />}
          {showBillingContext && <BillingSummaryPanel summary={billingSummary} />}
          {showAccountContext && <AccountSummaryPanel summary={accountSummaryResponse?.account ?? null} />}
        </div>

        <div>
          <TicketActions ticketId={ticketId} ticket={ticket} comments={comments} staff={staff} />
        </div>
      </div>
    </div>
  );
}
