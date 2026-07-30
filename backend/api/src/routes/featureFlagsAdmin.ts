/**
 * Feature flag admin routes. Read is available to any staff role
 * (viewer/operator/admin); creating and toggling flags is admin-only --
 * a wrongly-toggled flag can affect every customer instantly, the same
 * blast-radius reasoning as billing:manage/service_account:manage.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createFlag,
  getFlag,
  isFeatureEnabled,
  listFlags,
  setFlagEnabled,
  setFlagRolloutPercentage,
} from "../../../Platform-Services/FeatureFlags/src/featureFlagService.js";
import { FeatureFlagError } from "../../../Platform-Services/FeatureFlags/src/types.js";
import type { FeatureFlagsRepository } from "../../../Platform-Services/FeatureFlags/src/repository.js";
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

const featureFlagErrorStatus: Record<FeatureFlagError["code"], number> = {
  invalid_key: 400,
  duplicate_key: 409,
  flag_not_found: 404,
  invalid_rollout_percentage: 400,
};

const createSchema = z.object({
  key: z.string().min(1),
  description: z.string().min(1),
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().optional(),
});

const setEnabledSchema = z.object({ enabled: z.boolean() });
const setRolloutSchema = z.object({ rolloutPercentage: z.number() });

export function registerFeatureFlagsAdminRoutes(
  app: FastifyInstance,
  repo: FeatureFlagsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.get("/v1/admin/feature-flags", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:read")) return;
    const flags = await listFlags(repo);
    return reply.status(200).send({ flags });
  });

  scopedApp.get("/v1/admin/feature-flags/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:read")) return;
    const { key } = request.params as { key: string };
    try {
      const flag = await getFlag(repo, key);
      return reply.status(200).send(flag);
    } catch (err) {
      if (err instanceof FeatureFlagError) {
        return reply.status(featureFlagErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/feature-flags/:key/evaluate", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:read")) return;
    const { key } = request.params as { key: string };
    const query = request.query as { organizationId?: string } | undefined;
    const enabled = await isFeatureEnabled(repo, key, query?.organizationId);
    return reply.status(200).send({ key, organizationId: query?.organizationId ?? null, enabled });
  });

  scopedApp.post("/v1/admin/feature-flags", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:manage")) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const flag = await createFlag(repo, parsed.data);
      return reply.status(201).send(flag);
    } catch (err) {
      if (err instanceof FeatureFlagError) {
        return reply.status(featureFlagErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/feature-flags/:key/enabled", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = setEnabledSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const flag = await setFlagEnabled(repo, key, parsed.data.enabled);
      return reply.status(200).send(flag);
    } catch (err) {
      if (err instanceof FeatureFlagError) {
        return reply.status(featureFlagErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/feature-flags/:key/rollout", async (request, reply) => {
    if (!checkPermission(request, reply, "feature_flag:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = setRolloutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const flag = await setFlagRolloutPercentage(repo, key, parsed.data.rolloutPercentage);
      return reply.status(200).send(flag);
    } catch (err) {
      if (err instanceof FeatureFlagError) {
        return reply.status(featureFlagErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
  });
}
