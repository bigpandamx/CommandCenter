/**
 * HTTP transport for the Aegis Desktop <-> Command Center protocol.
 * All actual logic lives in Customer-Connections/Desktop-Apps -- this file
 * only does request parsing, status-code mapping, and response shaping.
 *
 * Depends on `fastify` and `zod`, which are not installed in the offline
 * sandbox this was authored in. Type-check and run this after
 * `npm install` in backend/api.
 */
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  enrollDevice,
  EnrollmentError,
} from "../../../Customer-Connections/Desktop-Apps/src/enrollment.js";
import {
  handleCheckin,
  CheckinError,
} from "../../../Customer-Connections/Desktop-Apps/src/checkin.js";
import type { DesktopSyncRepository } from "../../../Customer-Connections/Desktop-Apps/src/repository.js";
import { resolveEntitlementPolicy } from "../../../Platform-Services/Subscriptions/src/resolvePolicy.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";

const enrollBodySchema = z.object({
  token: z.string().min(1),
  fingerprint: z.string().min(8),
  displayName: z.string().min(1).max(200),
  platform: z.enum(["windows", "macos", "linux"]),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
});

const checkinBodySchema = z.object({
  deviceId: z.string().uuid(),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  health: z.object({
    uptimeSeconds: z.number().nonnegative(),
    lastErrorCode: z.string().nullable(),
  }),
});

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

const enrollmentErrorStatus: Record<EnrollmentError["code"], number> = {
  invalid_token: 401,
  token_expired: 401,
  token_exhausted: 409,
  org_not_found: 404,
  device_limit_reached: 402,
};

const checkinErrorStatus: Record<CheckinError["code"], number> = {
  unauthorized: 401,
  device_not_found: 404,
  device_revoked: 403,
};

export function registerDesktopSyncRoutes(
  app: FastifyInstance,
  repo: DesktopSyncRepository,
  billingRepo: BillingRepository,
): void {
  app.post("/v1/enroll", async (request, reply) => {
    const parsed = enrollBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      // NOTE: the `as` here compensates for this sandbox's offline zod type
      // shim not narrowing enum literals through object() the way real zod
      // does -- parsed.data is runtime-validated against enrollBodySchema's
      // enum, this cast doesn't skip validation, just satisfies the shim's
      // weaker typing. Safe to remove once real @types/zod is installed.
      //
      // The policy resolver closes over the real BillingRepository here --
      // this is the one piece of real wiring that finally closes the gap
      // CUTOVER.md had named across several sessions
      // (resolveEntitlementPolicy existed but nothing ever called it from
      // enrollment). Desktop-Apps itself still has no dependency on
      // Subscriptions beyond the injected function's type.
      const result = await enrollDevice(
        repo,
        parsed.data as Parameters<typeof enrollDevice>[1],
        (org) => resolveEntitlementPolicy(billingRepo, org),
      );
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof EnrollmentError) {
        return reply
          .status(enrollmentErrorStatus[err.code])
          .send({ error: err.code, message: err.message });
      }
      request.log.error(err, "unexpected error during device enrollment");
      return reply.status(500).send({ error: "internal_error" });
    }
  });

  app.post("/v1/checkin", async (request, reply) => {
    const apiKey = bearerToken(request.headers.authorization);
    if (!apiKey) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    const parsed = checkinBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      const result = await handleCheckin(repo, parsed.data, apiKey);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof CheckinError) {
        return reply
          .status(checkinErrorStatus[err.code])
          .send({ error: err.code, message: err.message });
      }
      request.log.error(err, "unexpected error during device check-in");
      return reply.status(500).send({ error: "internal_error" });
    }
  });
}

export const desktopSyncPlugin: (
  repo: DesktopSyncRepository,
  billingRepo: BillingRepository,
) => FastifyPluginAsync = (repo, billingRepo) => async (app) => {
  registerDesktopSyncRoutes(app, repo, billingRepo);
};
