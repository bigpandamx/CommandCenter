/**
 * Postgres implementation of Control-Plane/Tickets's TicketsRepository
 * port. Same offline caveat as every other *.pg.ts file in this folder:
 * type-checked against pg's documented API, not executed against a live
 * database in this session.
 */
import type { Pool } from "pg";
import type { TicketsRepository } from "../../../Control-Plane/Tickets/src/repository.js";
import type { Ticket, TicketComment, TicketSearchQuery } from "../../../Control-Plane/Tickets/src/types.js";

export class PgTicketsRepository implements TicketsRepository {
  constructor(private readonly pool: Pool) {}

  async createTicket(ticket: Ticket): Promise<void> {
    await this.pool.query(
      `INSERT INTO tickets
         (id, display_id, organization_id, subject, description, status, priority, category, team,
          assigned_to_staff_id, reporter_name, reporter_email, source, created_at, updated_at,
          resolved_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        ticket.id,
        ticket.displayId,
        ticket.organizationId,
        ticket.subject,
        ticket.description,
        ticket.status,
        ticket.priority,
        ticket.category,
        ticket.team,
        ticket.assignedToStaffId,
        ticket.reporterName,
        ticket.reporterEmail,
        ticket.source,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.resolvedAt,
        ticket.closedAt,
      ],
    );
  }

  async getTicketById(ticketId: string): Promise<Ticket | null> {
    const { rows } = await this.pool.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async updateTicket(ticket: Ticket): Promise<void> {
    await this.pool.query(
      `UPDATE tickets SET
         subject = $2, description = $3, status = $4, priority = $5, category = $6, team = $7,
         assigned_to_staff_id = $8, reporter_name = $9, reporter_email = $10, updated_at = $11,
         resolved_at = $12, closed_at = $13
       WHERE id = $1`,
      [
        ticket.id,
        ticket.subject,
        ticket.description,
        ticket.status,
        ticket.priority,
        ticket.category,
        ticket.team,
        ticket.assignedToStaffId,
        ticket.reporterName,
        ticket.reporterEmail,
        ticket.updatedAt,
        ticket.resolvedAt,
        ticket.closedAt,
      ],
    );
  }

  async searchTickets(query: TicketSearchQuery): Promise<Ticket[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.priority) {
      params.push(query.priority);
      conditions.push(`priority = $${params.length}`);
    }
    if (query.team) {
      params.push(query.team);
      conditions.push(`team = $${params.length}`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`category = $${params.length}`);
    }
    if (query.organizationId) {
      params.push(query.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    if (query.assignedToStaffId) {
      params.push(query.assignedToStaffId);
      conditions.push(`assigned_to_staff_id = $${params.length}`);
    } else if (query.unassigned) {
      conditions.push(`assigned_to_staff_id IS NULL`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      const p = params.length;
      conditions.push(`(subject ILIKE $${p} OR description ILIKE $${p})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM tickets ${whereClause} ORDER BY updated_at DESC`,
      params,
    );
    return rows.map(mapTicket);
  }

  async addComment(comment: TicketComment): Promise<void> {
    await this.pool.query(
      `INSERT INTO ticket_comments (id, ticket_id, author_staff_id, body, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [comment.id, comment.ticketId, comment.authorStaffId, comment.body, comment.createdAt],
    );
  }

  async listComments(ticketId: string): Promise<TicketComment[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [ticketId],
    );
    return rows.map(mapComment);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTicket(row: any): Ticket {
  return {
    id: row.id,
    displayId: row.display_id,
    organizationId: row.organization_id,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    team: row.team,
    assignedToStaffId: row.assigned_to_staff_id,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComment(row: any): TicketComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorStaffId: row.author_staff_id,
    body: row.body,
    createdAt: row.created_at,
  };
}
