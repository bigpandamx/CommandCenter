import type { TicketsRepository } from "../src/repository.js";
import type { Ticket, TicketComment, TicketSearchQuery } from "../src/types.js";

export class FakeTicketsRepository implements TicketsRepository {
  tickets = new Map<string, Ticket>();
  comments = new Map<string, TicketComment[]>(); // ticketId -> comments

  async createTicket(ticket: Ticket) {
    this.tickets.set(ticket.id, ticket);
  }

  async getTicketById(ticketId: string) {
    return this.tickets.get(ticketId) ?? null;
  }

  async updateTicket(ticket: Ticket) {
    this.tickets.set(ticket.id, ticket);
  }

  async searchTickets(query: TicketSearchQuery) {
    let matches = [...this.tickets.values()];

    if (query.status) matches = matches.filter((t) => t.status === query.status);
    if (query.priority) matches = matches.filter((t) => t.priority === query.priority);
    if (query.team) matches = matches.filter((t) => t.team === query.team);
    if (query.category) matches = matches.filter((t) => t.category === query.category);
    if (query.organizationId) matches = matches.filter((t) => t.organizationId === query.organizationId);
    if (query.assignedToStaffId) {
      matches = matches.filter((t) => t.assignedToStaffId === query.assignedToStaffId);
    } else if (query.unassigned) {
      matches = matches.filter((t) => t.assignedToStaffId === null);
    }
    if (query.text) {
      const needle = query.text.toLowerCase();
      matches = matches.filter(
        (t) => t.subject.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle),
      );
    }

    return matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async addComment(comment: TicketComment) {
    const existing = this.comments.get(comment.ticketId) ?? [];
    existing.push(comment);
    this.comments.set(comment.ticketId, existing);
  }

  async listComments(ticketId: string) {
    return [...(this.comments.get(ticketId) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
