/**
 * HTTP transport for POST /v1/telemetry. Same split as desktopSync.ts:
 * this file only does request parsing, status-code mapping, and response
 * shaping -- all real logic lives in Customer-Connections/Desktop-Apps.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ingestTelemetry, TelemetryError } from "../../../Customer-Connections/Desktop-Apps/src/telemetry.js";
import type { DesktopSyncRepository } from "../../../Customer-Connections/Desktop-Apps/src/repository.js";
import type { TelemetryRepository } from "../../../Customer-Connections/Desktop-Apps/src/telemetryRepository.js";

const telemetryEventSchema = z.object({
  type: z.enum(["conmon_report", "usage_metric", "error_report", "health_snapshot"]),
  occurredAt: z.string(),
  payload: z.object({}).optional(),
});

const telemetryBodySchema = z.object({
  deviceId: z.string().uuid(),
  events: z.array(telemetryEventSchema),
});

const telemetryErrorStatus: Record<TelemetryError["code"], number> = {
  unauthorized: 401,
  device_not_found: 404,
  device_revoked: 403,
  empty_batch: 400,
  batch_too_large: 413,
  invalid_event: 400,
};

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function registerTelemetryRoutes(
  app: FastifyInstance,
  desktopSyncRepo: DesktopSyncRepository,
  telemetryRepo: TelemetryRepository,
): void {
  app.post("/v1/telemetry", async (request, reply) => {
    const apiKey = bearerToken(request.headers.authorization);
    if (!apiKey) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    const parsed = telemetryBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      // NOTE: the `as` compensates for this sandbox's offline zod shim not
      // narrowing enum literals / turning occurredAt into a Date through
      // object() the way real zod (with z.coerce.date()) would -- see the
      // equivalent note in desktopSync.ts. Real zod should use
      // z.coerce.date() for occurredAt directly instead of this cast.
      const events = parsed.data.events.map((e) => ({
        ...e,
        occurredAt: new Date(e.occurredAt),
        payload: e.payload ?? {},
      })) as Parameters<typeof ingestTelemetry>[2]["events"];

      const result = await ingestTelemetry(
        desktopSyncRepo,
        telemetryRepo,
        { deviceId: parsed.data.deviceId, events },
        apiKey,
      );
      return reply.status(202).send(result);
    } catch (err) {
      if (err instanceof TelemetryError) {
        return reply
          .status(telemetryErrorStatus[err.code])
          .send({ error: err.code, message: err.message });
      }
      request.log.error(err, "unexpected error during telemetry ingestion");
      return reply.status(500).send({ error: "internal_error" });
    }
  });
}
