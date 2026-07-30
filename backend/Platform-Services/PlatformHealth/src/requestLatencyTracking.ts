import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PlatformHealthRepository } from "./repository.js";
import type { RequestLatencyRecord } from "./types.js";

const startTimes = new WeakMap<object, number>();

/**
 * Every real route in this codebase follows
 * /v1/{admin|service|desktop}/{service-name}/... -- "service" is that
 * third path segment. Derived from the route PATTERN
 * (request.routeOptions.url, e.g. "/v1/admin/tickets/:ticketId"), not
 * the raw URL -- using the raw URL would make every distinct ticket id
 * look like its own "service." Falls back to the raw url if
 * routeOptions.url is somehow unavailable (shouldn't happen for
 * onResponse -- see the shim's own doc comment on why), and to
 * "unknown" if even that doesn't parse into the expected shape rather
 * than throwing and losing the whole request's latency data over a
 * naming edge case.
 */
export function deriveServiceFromRoutePattern(routePattern: string): string {
  const segments = routePattern.split("/").filter(Boolean);
  return segments[2] ?? "unknown";
}

/**
 * Registers the onRequest/onResponse hook pair once, on the app
 * instance, BEFORE other routes are registered -- Fastify hooks apply
 * to every route registered after they're added, which is why this
 * needs to run early in server.ts, not alongside the individual
 * route-registration calls it's tracking.
 */
export function registerLatencyTracking(app: FastifyInstance, healthRepo: PlatformHealthRepository): void {
  app.addHook("onRequest", async (request) => {
    startTimes.set(request, Date.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = startTimes.get(request);
    startTimes.delete(request);
    // Shouldn't happen (onResponse always follows a matched onRequest
    // for the same request), but don't fabricate a latency number for
    // a request this hook never actually timed.
    if (startedAt === undefined) return;

    const routePattern = request.routeOptions?.url ?? request.url;
    const record: RequestLatencyRecord = {
      id: randomUUID(),
      service: deriveServiceFromRoutePattern(routePattern),
      method: request.method,
      routePattern,
      statusCode: reply.statusCode,
      latencyMs: Date.now() - startedAt,
      occurredAt: new Date(),
    };

    // A health-tracking failure must never surface to the actual
    // request/response cycle it's observing -- same "log, don't throw"
    // discipline as TrackedAIProvider's own recording step.
    try {
      await healthRepo.recordRequestLatency(record);
    } catch (err) {
      request.log.error(err);
    }
  });
}
