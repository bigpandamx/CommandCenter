/**
 * Control-Plane/Agents admin routes: staff submit tasks, drain the
 * queue (one at a time or fully), browse task history, and check
 * per-agent stats. Read-only for viewers; submitting/processing gated
 * by agents:manage. No scheduler wired here -- draining the queue is
 * staff-triggered (POST .../process) for this first pass, same
 * "manual trigger, not yet scheduled" tier Threat-Intelligence's
 * benchmark calculation and cleanup started at.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { submitTask, processNextTask, getTask, AgentOrchestratorError } from "../../../Control-Plane/Agents/src/orchestrator.js";
import type { AgentsRepository } from "../../../Control-Plane/Agents/src/repository.js";
import type { AgentRegistry } from "../../../Control-Plane/Agents/src/orchestrator.js";
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

const submitTaskSchema = z.object({
  capability: z.enum(["flag_stale_tickets", "audit_threat_intel", "audit_compliance_sources", "monitor_risk_insights", "monitor_risk_factor"]),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  payload: z.record(z.unknown()).optional(),
});

export function registerAgentsAdminRoutes(
  app: FastifyInstance,
  repo: AgentsRepository,
  registry: AgentRegistry,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/agents/tasks", async (request, reply) => {
    if (!checkPermission(request, reply, "agents:manage")) return;
    const parsed = submitTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const task = await submitTask(repo, parsed.data as Parameters<typeof submitTask>[1]);
    return reply.status(201).send(task);
  });

  scopedApp.get("/v1/admin/agents/tasks/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "agents:read")) return;
    const { id } = request.params as { id: string };
    try {
      const task = await getTask(repo, id);
      return reply.status(200).send(task);
    } catch (err) {
      if (err instanceof AgentOrchestratorError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/agents/tasks", async (request, reply) => {
    if (!checkPermission(request, reply, "agents:read")) return;
    const query = request.query as { capability?: string; status?: string; limit?: string } | undefined;
    const tasks = await repo.searchTasks({
      capability: query?.capability as Parameters<typeof repo.searchTasks>[0]["capability"],
      status: query?.status as Parameters<typeof repo.searchTasks>[0]["status"],
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ tasks });
  });

  // Processes exactly one queued task per call -- a staff "run pending
  // tasks" button in the admin portal can call this repeatedly (or a
  // future scheduler can), matching how Threat-Intelligence's benchmark
  // calculation and cleanup jobs are staff-triggered rather than
  // automatically scheduled in this first pass.
  scopedApp.post("/v1/admin/agents/process", async (request, reply) => {
    if (!checkPermission(request, reply, "agents:manage")) return;
    const result = await processNextTask(repo, registry);
    if (!result) {
      return reply.status(200).send({ processed: false, message: "Queue is empty." });
    }
    return reply.status(200).send({ processed: true, task: result });
  });

  scopedApp.get("/v1/admin/agents", async (request, reply) => {
    if (!checkPermission(request, reply, "agents:read")) return;
    const agents = await Promise.all(
      registry.list().map(async (a) => ({
        agentId: a.agentId,
        agentType: a.agentType,
        capability: a.capability,
        stats: await repo.getAgentStats(a.agentId),
      })),
    );
    return reply.status(200).send({ agents });
  });
  });
}
