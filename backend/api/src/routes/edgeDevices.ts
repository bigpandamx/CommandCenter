/**
 * HTTP transport for Edge-Devices. Two auth models on the same router,
 * matching Aegis's original split:
 *   - Agent-facing (/heartbeat, /events): X-Agent-ID + X-Agent-Key headers,
 *     no staff session.
 *   - Staff-facing (register, list, rotate-key, deregister): staff
 *     session + RBAC, same pattern as every other admin route.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerEdgeDevice } from "../../../Customer-Connections/Edge-Devices/src/registration.js";
import { recordHeartbeat } from "../../../Customer-Connections/Edge-Devices/src/heartbeat.js";
import { ingestEdgeDeviceEvents, EdgeDeviceEventError } from "../../../Customer-Connections/Edge-Devices/src/events.js";
import { rotateEdgeDeviceKey, deregisterEdgeDevice, EdgeDeviceNotFoundError } from "../../../Customer-Connections/Edge-Devices/src/keyRotation.js";
import { EdgeDeviceAuthError } from "../../../Customer-Connections/Edge-Devices/src/auth.js";
import type { EdgeDevicesRepository } from "../../../Customer-Connections/Edge-Devices/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const registerSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  deploymentType: z.enum(["saas", "hybrid", "on_prem", "vpc"]),
  environment: z.string().optional(),
});

const heartbeatSchema = z.object({ version: z.string().optional() });

const eventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum([
    "heartbeat",
    "agent_started",
    "agent_stopped",
    "config_reload",
    "prompt_allowed",
    "prompt_blocked",
    "policy_violation",
    "policy_sync_ack",
    "error",
  ]),
  severity: z.enum(["info", "warning", "error", "critical"]).optional(),
  occurredAt: z.string().optional(),
  // .passthrough() is load-bearing, not decorative: Zod's default
  // z.object() behavior STRIPS any key not declared in the shape, and
  // this shape declares none -- without passthrough(), every event's
  // payload would silently parse down to `{}` regardless of what the
  // device actually sent, including policy_sync_ack's
  // policySnapshotVersion field that ingestEdgeDeviceEvents (Edge-
  // Devices/src/events.ts) depends on to clear pendingSync. Matches
  // EdgeDeviceEventInput.payload's own type (Record<string, unknown>),
  // which already declares arbitrary keys are expected.
  payload: z.object({}).passthrough().optional(),
});

const eventBatchSchema = z.object({ events: z.array(eventSchema) });

function agentHeaders(request: FastifyRequest): { agentId: string; agentKey: string } | null {
  const idHeader = request.headers["x-agent-id"];
  const keyHeader = request.headers["x-agent-key"];
  const agentId = Array.isArray(idHeader) ? idHeader[0] : idHeader;
  const agentKey = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
  if (!agentId || !agentKey) return null;
  return { agentId, agentKey };
}

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

export function registerEdgeDeviceRoutes(
  app: FastifyInstance,
  repo: EdgeDevicesRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  // --- Agent-facing (X-Agent-ID / X-Agent-Key) ---
  //
  // Deliberately registered directly on the shared app, NOT inside the
  // staff-facing register() block below -- these must never require a
  // staff session. See this file's own history: an earlier version
  // wrapped both route groups in the same scope, which silently pulled
  // these two routes behind requireStaffSession along with everything
  // else, since a preHandler hook added anywhere inside an
  // app.register() callback applies to every route in that same scope
  // regardless of textual order.

  app.post("/v1/edge-devices/:deviceId/heartbeat", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const headers = agentHeaders(request);
    if (!headers || headers.agentId !== deviceId) {
      return reply.status(401).send({ error: "missing_or_mismatched_agent_headers" });
    }
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const result = await recordHeartbeat(repo, deviceId, headers.agentKey, parsed.data);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof EdgeDeviceAuthError) {
        return reply.status(401).send({ error: err.code });
      }
      throw err;
    }
  });

  app.post("/v1/edge-devices/:deviceId/events", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const headers = agentHeaders(request);
    if (!headers || headers.agentId !== deviceId) {
      return reply.status(401).send({ error: "missing_or_mismatched_agent_headers" });
    }
    const parsed = eventBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const summary = await ingestEdgeDeviceEvents(
        repo,
        deviceId,
        headers.agentKey,
        parsed.data.events as Parameters<typeof ingestEdgeDeviceEvents>[3],
      );
      return reply.status(202).send(summary);
    } catch (err) {
      if (err instanceof EdgeDeviceAuthError) {
        return reply.status(401).send({ error: err.code });
      }
      if (err instanceof EdgeDeviceEventError) {
        return reply.status(err.code === "batch_too_large" ? 413 : 400).send({ error: err.code });
      }
      throw err;
    }
  });

  // --- Staff-facing (session + RBAC) ---
  //
  // Scoped via app.register() -- this is what actually isolates
  // requireStaffSession to just these routes. A bare app.addHook() on
  // the shared app instance (instead of scopedApp here) would leak
  // staff-session auth onto every route registered anywhere on that
  // instance, including the two agent-facing routes above and anything
  // server.ts registers afterward -- this is the exact bug this file
  // used to have.

  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.post("/v1/admin/edge-devices", async (request, reply) => {
      if (!checkPermission(request, reply, "enrollment_token:issue")) return;
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const result = await registerEdgeDevice(repo, parsed.data as Parameters<typeof registerEdgeDevice>[1]);
      return reply.status(201).send(result);
    });

    scopedApp.get("/v1/admin/organizations/:organizationId/edge-devices", async (request, reply) => {
      if (!checkPermission(request, reply, "org:read")) return;
      const { organizationId } = request.params as { organizationId: string };
      const devices = await repo.listDevicesForOrg(organizationId);
      return reply.status(200).send({ devices });
    });

    scopedApp.post("/v1/admin/edge-devices/:deviceId/rotate-key", async (request, reply) => {
      if (!checkPermission(request, reply, "enrollment_token:issue")) return;
      const { deviceId } = request.params as { deviceId: string };
      try {
        const result = await rotateEdgeDeviceKey(repo, deviceId);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof EdgeDeviceNotFoundError) {
          return reply.status(404).send({ error: "device_not_found" });
        }
        throw err;
      }
    });

    scopedApp.delete("/v1/admin/edge-devices/:deviceId", async (request, reply) => {
      if (!checkPermission(request, reply, "enrollment_token:revoke")) return;
      const { deviceId } = request.params as { deviceId: string };
      try {
        await deregisterEdgeDevice(repo, deviceId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof EdgeDeviceNotFoundError) {
          return reply.status(404).send({ error: "device_not_found" });
        }
        throw err;
      }
    });
  });
}
