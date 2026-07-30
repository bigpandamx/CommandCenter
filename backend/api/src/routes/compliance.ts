/**
 * Control-Plane/Compliance admin routes: manage sources, browse ingested
 * updates, and manually trigger an ingestion run. Same staff-session +
 * RBAC pattern as the rest of the admin surface.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  registerComplianceSource,
  deactivateComplianceSource,
  activateComplianceSource,
  updateSourceSchedule,
  addManualComplianceUpdate,
  ComplianceSourceError,
} from "../../../Control-Plane/Compliance/src/sourceManagement.js";
import { runComplianceIngestion, runComplianceIngestionForSource } from "../../../Control-Plane/Compliance/src/scheduler.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const createSourceSchema = z.object({
  name: z.string().min(1),
  jurisdiction: z.string().min(1),
  frameworkTags: z.array(z.string()),
  sourceType: z.enum(["rss", "atom", "json_api", "manual"]),
  url: z.string().min(1),
  scheduleIntervalMinutes: z.number().int().positive().nullish(),
});

const scheduleSchema = z.object({ scheduleIntervalMinutes: z.number().int().positive().nullable() });

const manualUpdateSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  url: z.string().min(1),
  publishedAt: z.string().nullish(),
  country: z.string().nullish(),
  state: z.string().nullish(),
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

export function registerComplianceRoutes(app: FastifyInstance, repo: ComplianceRepository, staffAuthRepo: StaffAuthRepository): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/compliance/sources", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const parsed = createSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const source = await registerComplianceSource(repo, parsed.data as Parameters<typeof registerComplianceSource>[1]);
      return reply.status(201).send(source);
    } catch (err) {
      if (err instanceof ComplianceSourceError) {
        return reply.status(400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/compliance/sources", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:read")) return;
    const sources = await repo.listSources();
    return reply.status(200).send({ sources });
  });

  scopedApp.delete("/v1/admin/compliance/sources/:sourceId", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const { sourceId } = request.params as { sourceId: string };
    try {
      await deactivateComplianceSource(repo, sourceId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof ComplianceSourceError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  const sourceErrorStatus: Record<ComplianceSourceError["code"], number> = {
    source_not_found: 404,
    invalid_url: 400,
    not_manual_source: 400,
  };
  function handleSourceError(reply: FastifyReply, err: unknown) {
    if (err instanceof ComplianceSourceError) {
      return reply.status(sourceErrorStatus[err.code]).send({ error: err.code, message: err.message });
    }
    throw err;
  }

  scopedApp.post("/v1/admin/compliance/sources/:sourceId/activate", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const { sourceId } = request.params as { sourceId: string };
    try {
      await activateComplianceSource(repo, sourceId);
      return reply.status(204).send();
    } catch (err) {
      return handleSourceError(reply, err);
    }
  });

  // Manual retry -- reuses runComplianceIngestionForSource directly
  // (the same function the bulk scheduler calls per-source), so a
  // retry behaves identically to a scheduled run, not a separate
  // simplified path.
  scopedApp.post("/v1/admin/compliance/sources/:sourceId/retry", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const { sourceId } = request.params as { sourceId: string };
    const source = await repo.getSourceById(sourceId);
    if (!source) {
      return reply.status(404).send({ error: "source_not_found" });
    }
    const result = await runComplianceIngestionForSource(repo, source);
    return reply.status(200).send(result);
  });

  scopedApp.post("/v1/admin/compliance/sources/:sourceId/schedule", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const { sourceId } = request.params as { sourceId: string };
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      await updateSourceSchedule(repo, sourceId, parsed.data.scheduleIntervalMinutes);
      return reply.status(204).send();
    } catch (err) {
      return handleSourceError(reply, err);
    }
  });

  // Manual Sources: hand-add one document to a source with no
  // automated fetch adapter (ISO, certain state regulators).
  scopedApp.post("/v1/admin/compliance/sources/:sourceId/manual-updates", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const { sourceId } = request.params as { sourceId: string };
    const parsed = manualUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const summary = await addManualComplianceUpdate(repo, sourceId, {
        externalId: parsed.data.externalId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        url: parsed.data.url,
        publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
        country: parsed.data.country ?? null,
        state: parsed.data.state ?? null,
      });
      return reply.status(201).send(summary);
    } catch (err) {
      return handleSourceError(reply, err);
    }
  });

  scopedApp.post("/v1/admin/compliance/ingest", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:manage")) return;
    const results = await runComplianceIngestion(repo);
    return reply.status(200).send({ results });
  });

  // Read surface for Aegis (or staff dashboards) to pull ingested
  // updates. NOTE: this is gated by staff session for now, same as
  // everything else -- there is no service-to-service auth path yet for
  // Aegis's backend to call this unattended. See CUTOVER.md.
  scopedApp.get("/v1/admin/compliance/updates", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:read")) return;
    const query = request.query as { country?: string; state?: string; frameworkTag?: string; since?: string; limit?: string } | undefined;
    const updates = await repo.listUpdates({
      country: query?.country,
      state: query?.state,
      frameworkTag: query?.frameworkTag,
      since: query?.since ? new Date(query.since) : undefined,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ updates });
  });

  // Knowledge Base browse surface -- these read already-extracted
  // obligations and don't need an AIProvider configured, unlike the
  // analysis-triggering routes in complianceAnalysis.ts.
  scopedApp.get("/v1/admin/compliance/updates/:updateId/obligations", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:read")) return;
    const { updateId } = request.params as { updateId: string };
    const obligations = await repo.listObligationsForUpdate(updateId);
    return reply.status(200).send({ obligations });
  });

  scopedApp.get("/v1/admin/compliance/obligations", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:read")) return;
    const query = request.query as { industry?: string; limit?: string } | undefined;
    if (!query?.industry) {
      return reply.status(400).send({ error: "invalid_request", message: "industry query param is required" });
    }
    const obligations = await repo.listObligationsByIndustry(query.industry, {
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ obligations });
  });

  scopedApp.get("/v1/admin/compliance/obligations/upcoming", async (request, reply) => {
    if (!checkPermission(request, reply, "compliance:read")) return;
    const query = request.query as { before?: string; limit?: string } | undefined;
    const before = query?.before ? new Date(query.before) : new Date();
    const obligations = await repo.listUpcomingObligations(before, {
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ obligations });
  });
  });
}
