import type { Ticket, TicketComment, TicketSearchQuery } from "./types.js";

export interface TicketsRepository {
  createTicket(ticket: Ticket): Promise<void>;
  getTicketById(ticketId: string): Promise<Ticket | null>;
  updateTicket(ticket: Ticket): Promise<void>;
  searchTickets(query: TicketSearchQuery): Promise<Ticket[]>;

  addComment(comment: TicketComment): Promise<void>;
  listComments(ticketId: string): Promise<TicketComment[]>;
}
