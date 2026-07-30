import { randomUUID } from "node:crypto";
import type { TicketsRepository } from "./repository.js";
import { TicketError } from "./ticketService.js";
import type { TicketComment } from "./types.js";

export async function addTicketComment(
  repo: TicketsRepository,
  ticketId: string,
  authorStaffId: string,
  body: string,
  now: Date = new Date(),
): Promise<TicketComment> {
  if (!body.trim()) {
    throw new TicketError("Comment body cannot be empty", "invalid_input");
  }
  const ticket = await repo.getTicketById(ticketId);
  if (!ticket) {
    throw new TicketError(`Unknown ticket: ${ticketId}`, "ticket_not_found");
  }

  const comment: TicketComment = {
    id: randomUUID(),
    ticketId,
    authorStaffId,
    body: body.trim(),
    createdAt: now,
  };
  await repo.addComment(comment);

  // A comment is activity -- bump updatedAt so the ticket surfaces
  // correctly in an "recently active" sort, even though nothing about
  // the ticket's own fields changed.
  await repo.updateTicket({ ...ticket, updatedAt: now });

  return comment;
}
