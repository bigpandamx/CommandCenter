/**
 * Control-Plane/Tickets admin routes: search, view, assign, change
 * status, comment. Same staff-session + RBAC pattern as the rest of the
 * admin surface. Ticket creation from a customer's reported problem is
 * NOT here -- that's POST /v1/service/tickets (serviceApi.ts), since
 * customers relay through Aegis's backend, not Command Center directly.
 * Staff can still create internal tickets manually via this file's
 * POST /v1/admin/tickets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createTicket,
  assignTicket,
  changeTicketStatus,
  TicketError,
} from "../../../Control-Plane/Tickets/src/ticketService.js";
import { addTicketComment } from "../../../Control-Plane/Tickets/src/comments.js";
import type { TicketsRepository } from "../../../Control-Plane/Tickets/src/repository.js";
import type { IdentityRepository } from "../../../Platform-Services/Identity/src/identityRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const categories = ["bug", "billing", "compliance", "account", "technical_support", "feature_request", "other"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const teams = ["engineering", "support"] as const;
const statuses = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"] as const;

const createTicketSchema = z.object({
  organizationId: z.string().uuid().optional(),
  subject: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(categories),
  priority: z.enum(priorities).optional(),
  team: z.enum(teams).optional(),
  reporterName: z.string().optional(),
  reporterEmail: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(statuses) });
const assignSchema = z.object({ staffId: z.string().uuid().nullable() });
const commentSchema = z.object({ body: z.string().min(1) });

const errorStatus: Record<TicketError["code"], number> = {
  ticket_not_found: 404,
  invalid_input: 400,
  invalid_status_transition: 409,
};

function checkPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: Parameters<typeof assertPermission>[1],
): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, permission);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

export function registerTicketsAdminRoutes(
  app: FastifyInstance,
  repo: TicketsRepository,
  identityRepo: IdentityRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/tickets", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:create")) return;
    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const ticket = await createTicket(repo, identityRepo, {
        ...(parsed.data as Parameters<typeof createTicket>[2]),
        source: "staff",
      });
      return reply.status(201).send(ticket);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.status(errorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/tickets", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:read")) return;
    const query = request.query as
      | {
          status?: string;
          priority?: string;
          team?: string;
          category?: string;
          organizationId?: string;
          assignedToStaffId?: string;
          unassigned?: string;
          text?: string;
        }
      | undefined;
    const tickets = await repo.searchTickets({
      status: query?.status as Parameters<typeof repo.searchTickets>[0]["status"],
      priority: query?.priority as Parameters<typeof repo.searchTickets>[0]["priority"],
      team: query?.team as Parameters<typeof repo.searchTickets>[0]["team"],
      category: query?.category as Parameters<typeof repo.searchTickets>[0]["category"],
      organizationId: query?.organizationId,
      assignedToStaffId: query?.assignedToStaffId,
      unassigned: query?.unassigned === "true",
      text: query?.text,
    });
    return reply.status(200).send({ tickets });
  });

  scopedApp.get("/v1/admin/tickets/:ticketId", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:read")) return;
    const { ticketId } = request.params as { ticketId: string };
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }
    const comments = await repo.listComments(ticketId);
    return reply.status(200).send({ ticket, comments });
  });

  scopedApp.patch("/v1/admin/tickets/:ticketId/status", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:manage")) return;
    const { ticketId } = request.params as { ticketId: string };
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const ticket = await changeTicketStatus(repo, ticketId, parsed.data.status);
      return reply.status(200).send(ticket);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.status(errorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/tickets/:ticketId/assign", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:manage")) return;
    const { ticketId } = request.params as { ticketId: string };
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const ticket = await assignTicket(repo, ticketId, parsed.data.staffId);
      return reply.status(200).send(ticket);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.status(errorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/tickets/:ticketId/comments", async (request, reply) => {
    if (!checkPermission(request, reply, "ticket:manage")) return;
    const { ticketId } = request.params as { ticketId: string };
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const user = getAuthenticatedStaffUser(request);
    try {
      const comment = await addTicketComment(repo, ticketId, user.id, parsed.data.body);
      return reply.status(201).send(comment);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.status(errorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
  });
}
