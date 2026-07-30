/**
 * Real staff authentication for Command Center admin routes -- replaces
 * staffAuthPlaceholder.ts's requireInternalKey. Verifies a Bearer session
 * token via Platform-Services/Authentication's verifySession, and attaches
 * the authenticated staff user to the request for downstream RBAC checks.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession, AuthError } from "../../../Platform-Services/Authentication/src/staffAuthService.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { assertPermission, ForbiddenError, type Permission } from "../../../Platform-Services/Authentication/src/rbac.js";
import type { StaffUser } from "../../../Platform-Services/Authentication/src/staffTypes.js";

// Fastify doesn't have a first-class "extend the request type" story in our
// offline shim; attach the authenticated user under a well-known property
// and read it back via this helper so there's exactly one place that knows
// the property name.
const STAFF_USER_KEY = "__staffUser";

export function getAuthenticatedStaffUser(
  request: FastifyRequest,
): Omit<StaffUser, "passwordHash"> {
  const user = (request as unknown as Record<string, unknown>)[STAFF_USER_KEY];
  if (!user) {
    throw new Error(
      "getAuthenticatedStaffUser called without requireStaffSession having run first",
    );
  }
  return user as Omit<StaffUser, "passwordHash">;
}

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function requireStaffSession(repo: StaffAuthRepository) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      reply.status(401).send({ error: "missing_bearer_token" });
      return;
    }

    try {
      const user = await verifySession(repo, token);
      (request as unknown as Record<string, unknown>)[STAFF_USER_KEY] = user;
    } catch (err) {
      if (err instanceof AuthError) {
        reply.status(401).send({ error: err.code });
        return;
      }
      throw err;
    }
  };
}

/** Wraps a route handler with a permission check, using the user requireStaffSession already attached. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = getAuthenticatedStaffUser(request);
    try {
      assertPermission(user.role, permission);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        reply.status(403).send({ error: "forbidden", permission: err.permission });
        return;
      }
      throw err;
    }
  };
}
