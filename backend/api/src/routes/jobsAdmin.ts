/**
 * Jobs admin routes. jobs:read for browsing, jobs:manage for
 * triggering a run or changing a schedule -- same read/manage split
 * every other domain in this codebase already uses.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { computeJobsOverview } from "../../../Platform-Services/Jobs/src/jobsOverview.js";
import { runJob } from "../../../Platform-Services/Jobs/src/jobRunner.js";
import type { JobsRepository } from "../../../Platform-Services/Jobs/src/repository.js";
import type { JobDefinition, JobSchedule } from "../../../Platform-Services/Jobs/src/types.js";
import { buildSourceIngestionJobDefinitions } from "../../../Platform-Services/Jobs/src/jobRegistry.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function checkPermission(request: FastifyRequest, reply: FastifyReply, permission: Parameters<typeof assertPermission>[1]): boolean {
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

const scheduleSchema = z.object({
  intervalMinutes: z.number().int().positive(),
  enabled: z.boolean(),
});

export function registerJobsAdminRoutes(
  app: FastifyInstance,
  jobsRepo: JobsRepository,
  complianceRepo: ComplianceRepository,
  staticDefinitions: JobDefinition[],
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/jobs", async (request, reply) => {
      if (!checkPermission(request, reply, "jobs:read")) return;
      const jobs = await computeJobsOverview(jobsRepo, complianceRepo, staticDefinitions);
      return reply.status(200).send({ jobs });
    });

    scopedApp.get("/v1/admin/jobs/history", async (request, reply) => {
      if (!checkPermission(request, reply, "jobs:read")) return;
      const query = request.query as { jobKey?: string; limit?: string } | undefined;
      const runs = await jobsRepo.listJobRuns({
        jobKey: query?.jobKey,
        limit: query?.limit ? Number(query.limit) : undefined,
      });
      return reply.status(200).send({ runs });
    });

    scopedApp.get("/v1/admin/jobs/failures", async (request, reply) => {
      if (!checkPermission(request, reply, "jobs:read")) return;
      const query = request.query as { limit?: string } | undefined;
      const runs = await jobsRepo.listFailedJobRuns({ limit: query?.limit ? Number(query.limit) : undefined });
      return reply.status(200).send({ runs });
    });

    scopedApp.post("/v1/admin/jobs/:key/run", async (request, reply) => {
      if (!checkPermission(request, reply, "jobs:manage")) return;
      const { key } = request.params as { key: string };
      const user = getAuthenticatedStaffUser(request);

      const sourceDefinitions = await buildSourceIngestionJobDefinitions(complianceRepo);
      const definition = [...staticDefinitions, ...sourceDefinitions].find((d) => d.key === key);
      if (!definition) {
        return reply.status(404).send({ error: "job_not_found", message: `No registered job with key "${key}"` });
      }

      const run = await runJob(jobsRepo, definition, "manual", user.id);
      return reply.status(201).send(run);
    });

    scopedApp.post("/v1/admin/jobs/:key/schedule", async (request, reply) => {
      if (!checkPermission(request, reply, "jobs:manage")) return;
      const { key } = request.params as { key: string };
      if (key.startsWith("source-ingestion:")) {
        return reply.status(400).send({
          error: "not_a_static_job",
          message: "A per-source ingestion job's schedule is the source's own scheduleIntervalMinutes -- edit it via Source Management, not here.",
        });
      }
      const parsed = scheduleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const staticKeys = new Set(staticDefinitions.map((d) => d.key));
      if (!staticKeys.has(key)) {
        return reply.status(404).send({ error: "job_not_found", message: `No registered static job with key "${key}"` });
      }

      const schedule: JobSchedule = {
        jobKey: key,
        intervalMinutes: parsed.data.intervalMinutes,
        enabled: parsed.data.enabled,
        updatedAt: new Date(),
      };
      await jobsRepo.upsertJobSchedule(schedule);
      return reply.status(200).send(schedule);
    });
  });
}
