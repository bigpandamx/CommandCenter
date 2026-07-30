import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { login, logout, AuthError } from "../../../Platform-Services/Authentication/src/staffAuthService.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const authErrorStatus: Record<AuthError["code"], number> = {
  invalid_credentials: 401,
  account_disabled: 403,
  invalid_session: 401,
  session_expired: 401,
  email_already_registered: 409,
};

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function registerStaffAuthRoutes(app: FastifyInstance, repo: StaffAuthRepository): void {
  app.post("/v1/staff/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const result = await login(repo, parsed.data.email, parsed.data.password);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(authErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  app.post("/v1/staff/logout", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (token) {
      await logout(repo, token);
    }
    return reply.status(204).send();
  });
}
