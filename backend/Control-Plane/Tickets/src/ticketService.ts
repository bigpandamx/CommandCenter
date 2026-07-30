import { randomUUID } from "node:crypto";
import type { TicketsRepository } from "./repository.js";
import { defaultTeamForCategory } from "./routing.js";
import type { CreateTicketInput, Ticket, TicketStatus } from "./types.js";
import type { IdentityRepository } from "../../../Platform-Services/Identity/src/identityRepository.js";
import { generateDisplayId } from "../../../Platform-Services/Identity/src/idGenerator.js";

export class TicketError extends Error {
  constructor(
    message: string,
    public readonly code: "ticket_not_found" | "invalid_input" | "invalid_status_transition",
  ) {
    super(message);
    this.name = "TicketError";
  }
}

const DEFAULT_PRIORITY = "medium";

export async function createTicket(
  repo: TicketsRepository,
  identityRepo: IdentityRepository,
  input: CreateTicketInput,
  now: Date = new Date(),
): Promise<Ticket> {
  if (!input.subject.trim()) {
    throw new TicketError("Ticket subject is required", "invalid_input");
  }
  if (!input.description.trim()) {
    throw new TicketError("Ticket description is required", "invalid_input");
  }

  const displayId = await generateDisplayId(identityRepo, "TKT");

  const ticket: Ticket = {
    id: randomUUID(),
    displayId,
    organizationId: input.organizationId ?? null,
    subject: input.subject.trim(),
    description: input.description.trim(),
    status: "open",
    priority: input.priority ?? DEFAULT_PRIORITY,
    category: input.category,
    team: input.team ?? defaultTeamForCategory(input.category),
    assignedToStaffId: null,
    reporterName: input.reporterName ?? null,
    reporterEmail: input.reporterEmail ?? null,
    source: input.source,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    closedAt: null,
  };

  await repo.createTicket(ticket);
  return ticket;
}

export async function assignTicket(
  repo: TicketsRepository,
  ticketId: string,
  staffId: string | null,
  now: Date = new Date(),
): Promise<Ticket> {
  const ticket = await repo.getTicketById(ticketId);
  if (!ticket) {
    throw new TicketError(`Unknown ticket: ${ticketId}`, "ticket_not_found");
  }

  const updated: Ticket = {
    ...ticket,
    assignedToStaffId: staffId,
    // Assigning an open ticket implicitly starts work on it -- a ticket
    // that's already past "open" (in_progress, waiting_on_customer, etc.)
    // keeps its current status; reassignment alone shouldn't regress a
    // ticket that's further along back to an earlier state.
    status: ticket.status === "open" && staffId ? "in_progress" : ticket.status,
    updatedAt: now,
  };
  await repo.updateTicket(updated);
  return updated;
}

/**
 * Valid status transitions. Not every status can go directly to every
 * other status -- most notably, "closed" is a terminal state you leave
 * only via an explicit reopen (there is no direct closed -> in_progress;
 * a closed ticket must be reopened first). This is a deliberately small,
 * permissive state machine, not a rigid workflow engine -- it exists to
 * catch obviously-wrong transitions (closing an already-closed ticket),
 * not to encode an elaborate support process.
 */
const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting_on_customer", "resolved", "closed"],
  in_progress: ["waiting_on_customer", "resolved", "closed", "open"],
  waiting_on_customer: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "in_progress"], // reopen from resolved without going through the full "reopen" ceremony
  closed: ["open"], // reopening a closed ticket goes back to "open", not straight to some mid-flow status
};

export async function changeTicketStatus(
  repo: TicketsRepository,
  ticketId: string,
  newStatus: TicketStatus,
  now: Date = new Date(),
): Promise<Ticket> {
  const ticket = await repo.getTicketById(ticketId);
  if (!ticket) {
    throw new TicketError(`Unknown ticket: ${ticketId}`, "ticket_not_found");
  }

  if (ticket.status === newStatus) {
    return ticket; // no-op, not an error -- setting a ticket to its current status is harmless
  }

  if (!VALID_TRANSITIONS[ticket.status].includes(newStatus)) {
    throw new TicketError(
      `Cannot transition ticket from "${ticket.status}" to "${newStatus}"`,
      "invalid_status_transition",
    );
  }

  const updated: Ticket = {
    ...ticket,
    status: newStatus,
    updatedAt: now,
    resolvedAt: newStatus === "resolved" ? now : ticket.resolvedAt,
    closedAt: newStatus === "closed" ? now : newStatus === "open" ? null : ticket.closedAt,
  };
  await repo.updateTicket(updated);
  return updated;
}
