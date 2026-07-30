/**
 * Admin routes for staff to manage service accounts -- create (with
 * scopes), list, rotate key, revoke. Gated by service_account:manage
 * (admin-only), same staff-session pattern as the rest of the admin
 * surface. Granting API access to another service is sensitive enough
 * to warrant its own permission rather than piggybacking on staff:manage.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createServiceAccount,
  rotateServiceAccountKey,
  revokeServiceAccount,
  ServiceAccountError,
} from "../../../Platform-Services/Authentication/src/serviceAccountService.js";
import type { ServiceAccountRepository } from "../../../Platform-Services/Authentication/src/serviceAccountRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission, ALL_PERMISSIONS } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scopes: z.array(z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]])),
});

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

export function registerServiceAccountAdminRoutes(app: FastifyInstance, repo: ServiceAccountRepository, staffAuthRepo: StaffAuthRepository): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/service-accounts", async (request, reply) => {
    if (!checkPermission(request, reply, "service_account:manage")) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const result = await createServiceAccount(repo, parsed.data as Parameters<typeof createServiceAccount>[1]);
    return reply.status(201).send(result);
  });

  scopedApp.get("/v1/admin/service-accounts", async (request, reply) => {
    if (!checkPermission(request, reply, "service_account:manage")) return;
    const accounts = await repo.listServiceAccounts();
    // Never send apiKeyHash out, even to staff who are allowed to manage
    // service accounts -- there's no legitimate reason a hash needs to
    // leave the server, and it costs nothing to strip it here.
    const sanitized = accounts.map(({ apiKeyHash: _apiKeyHash, ...rest }) => rest);
    return reply.status(200).send({ serviceAccounts: sanitized });
  });

  scopedApp.post("/v1/admin/service-accounts/:accountId/rotate-key", async (request, reply) => {
    if (!checkPermission(request, reply, "service_account:manage")) return;
    const { accountId } = request.params as { accountId: string };
    try {
      const result = await rotateServiceAccountKey(repo, accountId);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof ServiceAccountError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.delete("/v1/admin/service-accounts/:accountId", async (request, reply) => {
    if (!checkPermission(request, reply, "service_account:manage")) return;
    const { accountId } = request.params as { accountId: string };
    try {
      await revokeServiceAccount(repo, accountId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof ServiceAccountError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });
  });
}
