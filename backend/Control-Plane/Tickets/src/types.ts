/**
 * Ticket intake: problems reported against a customer org (or, with
 * organizationId null, an internal-only issue) that get routed to either
 * engineering (a dev) or support (a representative) and tracked through
 * resolution. Customers don't have Command Center accounts -- a
 * customer-reported problem arrives via Aegis's backend relaying it
 * through the service API (see CUTOVER.md's pattern for signup/compliance),
 * carrying the reporter's contact info directly on the ticket rather than
 * a staff user reference.
 */

export type TicketStatus = "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory =
  | "bug"
  | "billing"
  | "compliance"
  | "account"
  | "technical_support"
  | "feature_request"
  | "other";
export type TicketTeam = "engineering" | "support";
export type TicketSource = "customer" | "staff" | "system";

export interface Ticket {
  id: string;
  /** Human-readable, e.g. "TKT-00129283" -- generated once at creation via Platform-Services/Identity, alongside (not replacing) `id`. What staff read to and type for customers; `id` remains what joins/foreign keys/API paths use internally. */
  displayId: string;
  /** Null for internal-only issues not tied to a specific customer org. */
  organizationId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  team: TicketTeam;
  /** Staff user id, null while unassigned. */
  assignedToStaffId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  source: TicketSource;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  /** Null for a system-generated note (e.g. an automated status-change record), if that's ever added -- every comment created through addComment today has an author. */
  authorStaffId: string | null;
  body: string;
  createdAt: Date;
}

export interface CreateTicketInput {
  organizationId?: string | null;
  subject: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  /** Overrides the category's default team routing when provided. */
  team?: TicketTeam;
  reporterName?: string | null;
  reporterEmail?: string | null;
  source: TicketSource;
}

export interface TicketSearchQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  team?: TicketTeam;
  category?: TicketCategory;
  organizationId?: string;
  assignedToStaffId?: string;
  /** True to find only unassigned tickets -- e.g. "what's in the engineering queue with nobody on it yet." Ignored if assignedToStaffId is also set. */
  unassigned?: boolean;
  /** Case-insensitive substring match against subject and description. */
  text?: string;
}
