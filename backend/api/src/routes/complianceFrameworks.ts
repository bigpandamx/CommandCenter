import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  ComplianceFrameworkError,
  createFramework,
  listFrameworks,
  addControlToFramework,
  removeControlFromFramework,
  listControlsForFramework,
  computeFrameworkCoverage,
} from "../../../Control-Plane/Compliance/src/frameworkService.js";

const frameworkErrorStatus: Record<ComplianceFrameworkError["code"], number> = {
  framework_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  control_not_found: 404,
};

function handleFrameworkError(reply: FastifyReply, err: unknown) {
  if (err instanceof ComplianceFrameworkError) {
    return reply.status(frameworkErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  throw err;
}

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

const createFrameworkSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

const controlSchema = z.object({ controlKey: z.string().min(1) });

export function registerComplianceFrameworksRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/frameworks", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const frameworks = await listFrameworks(complianceRepo);
      return reply.status(200).send({ frameworks });
    });

    scopedApp.post("/v1/admin/compliance/frameworks", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const parsed = createFrameworkSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const framework = await createFramework(complianceRepo, parsed.data);
        return reply.status(201).send(framework);
      } catch (err) {
        return handleFrameworkError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/compliance/frameworks/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const controls = await listControlsForFramework(complianceRepo, key);
        return reply.status(200).send({ controls });
      } catch (err) {
        return handleFrameworkError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/frameworks/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = controlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addControlToFramework(complianceRepo, key, parsed.data.controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleFrameworkError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/frameworks/:key/controls/:controlKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key, controlKey } = request.params as { key: string; controlKey: string };
      try {
        await removeControlFromFramework(complianceRepo, key, controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleFrameworkError(reply, err);
      }
    });

    // Coverage: how many of this framework's required controls are
    // actually backed by real regulatory analysis (at least one
    // mapped obligation), not a compliance claim -- see
    // computeFrameworkCoverage's own doc comment.
    scopedApp.get("/v1/admin/compliance/frameworks/:key/coverage", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const coverage = await computeFrameworkCoverage(complianceRepo, key);
        return reply.status(200).send(coverage);
      } catch (err) {
        return handleFrameworkError(reply, err);
      }
    });
  });
}
