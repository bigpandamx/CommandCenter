/**
 * GET /v1/admin/staff -- the staff directory. Exists specifically to
 * back pickers like ticket assignment (frontend's
 * TicketActions), which needed a real staff list instead of a raw
 * free-text ID field. Gated by staff:read (every role has it) rather
 * than staff:manage (admin-only, for account creation/disabling) --
 * seeing who's on staff isn't sensitive the way granting/revoking
 * accounts is.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

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

export function registerStaffDirectoryRoutes(app: FastifyInstance, repo: StaffAuthRepository): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(repo));

  scopedApp.get("/v1/admin/staff", async (request, reply) => {
    if (!checkPermission(request, reply, "staff:read")) return;
    const staff = await repo.listStaffUsers();
    // Never send passwordHash out, same rule as service accounts never
    // sending apiKeyHash -- there's no legitimate reason a hash needs to
    // leave the server.
    const sanitized = staff.map(({ passwordHash: _passwordHash, ...rest }) => rest);
    return reply.status(200).send({ staff: sanitized });
  });
  });
}
