/**
 * Service-to-service authentication for backend/api -- the counterpart to
 * staffAuth.ts's requireStaffSession, but for OTHER SERVICES (starting
 * with Aegis's own backend) rather than a logged-in human. Verifies a
 * Bearer service-account key and attaches the authenticated account to
 * the request for downstream scope checks.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  authenticateServiceAccount,
  assertServiceScope,
  ServiceAccountError,
} from "../../../Platform-Services/Authentication/src/serviceAccountService.js";
import type { ServiceAccountRepository } from "../../../Platform-Services/Authentication/src/serviceAccountRepository.js";
import type { Permission } from "../../../Platform-Services/Authentication/src/rbac.js";
import type { ServiceAccount } from "../../../Platform-Services/Authentication/src/serviceAccountTypes.js";

const SERVICE_ACCOUNT_KEY = "__serviceAccount";

export function getAuthenticatedServiceAccount(request: FastifyRequest): ServiceAccount {
  const account = (request as unknown as Record<string, unknown>)[SERVICE_ACCOUNT_KEY];
  if (!account) {
    throw new Error(
      "getAuthenticatedServiceAccount called without requireServiceAuth having run first",
    );
  }
  return account as ServiceAccount;
}

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/**
 * Authenticates the request as a service account, then asserts it has
 * the given scope -- combined into one preHandler (unlike the staff
 * session + separate per-route checkPermission pattern) since every
 * service-facing route in practice needs exactly one fixed scope, known
 * at route-registration time, not a per-request decision.
 */
export function requireServiceScope(repo: ServiceAccountRepository, scope: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      reply.status(401).send({ error: "missing_bearer_token" });
      return;
    }

    try {
      const account = await authenticateServiceAccount(repo, token);
      assertServiceScope(account, scope);
      (request as unknown as Record<string, unknown>)[SERVICE_ACCOUNT_KEY] = account;
    } catch (err) {
      if (err instanceof ServiceAccountError) {
        const status = err.code === "missing_scope" ? 403 : 401;
        reply.status(status).send({ error: err.code });
        return;
      }
      throw err;
    }
  };
}
