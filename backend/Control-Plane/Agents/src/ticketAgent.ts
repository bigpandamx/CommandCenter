import type { TicketsRepository } from "../../Tickets/src/repository.js";
import type { AgentTaskResult } from "./types.js";
import type { AgentHandler } from "./orchestrator.js";

const DEFAULT_STALE_HOURS = 48;
const ACTIVE_STATUSES = new Set(["open", "in_progress", "waiting_on_customer"]);

/**
 * Flags tickets that are still open/in-progress/waiting-on-customer but
 * haven't been updated (status change, comment, assignment) in longer
 * than the threshold. Read-only -- recommends, doesn't reassign or
 * escalate anything itself. Fetches the full ticket list rather than a
 * targeted query (TicketSearchQuery's status filter only takes one
 * value, not "any of these three") -- a reasonable first-pass approach,
 * worth revisiting if ticket volume ever makes that a real cost.
 */
export function createFlagStaleTicketsHandler(
  ticketsRepo: TicketsRepository,
  staleHours: number = DEFAULT_STALE_HOURS,
): AgentHandler {
  return async (payload: Record<string, unknown>): Promise<AgentTaskResult> => {
    const thresholdHours = typeof payload.staleHours === "number" ? payload.staleHours : staleHours;
    const now = new Date();
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000);

    const allTickets = await ticketsRepo.searchTickets({});
    const stale = allTickets.filter(
      (t) => ACTIVE_STATUSES.has(t.status) && t.updatedAt.getTime() < cutoff.getTime(),
    );

    return {
      success: true,
      summary:
        stale.length === 0
          ? `No stale tickets found (threshold: ${thresholdHours}h).`
          : `${stale.length} ticket(s) have had no activity in over ${thresholdHours}h.`,
      actionsTaken: [],
      recommendations: stale.map(
        (t) =>
          `Ticket "${t.subject}" (${t.id}) has been ${t.status} with no update since ${t.updatedAt.toISOString()} -- consider following up${t.assignedToStaffId ? " with the assignee" : " and assigning it"}.`,
      ),
      data: {
        staleThresholdHours: thresholdHours,
        staleTicketIds: stale.map((t) => t.id),
        staleCount: stale.length,
      },
    };
  };
}
