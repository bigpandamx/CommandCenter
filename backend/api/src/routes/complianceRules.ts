import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  ComplianceRuleError,
  createRule,
  listRules,
  linkUpdateToRule,
  unlinkUpdateFromRule,
  getRuleHistory,
  getCurrentVersion,
  addRelatedRule,
  removeRelatedRule,
  listRelatedRules,
} from "../../../Control-Plane/Compliance/src/ruleService.js";
import {
  RuleInterpretationError,
  synthesizeRuleInterpretation,
  isInterpretationStale,
} from "../../../Control-Plane/Compliance/src/ruleInterpretation.js";

const ruleErrorStatus: Record<ComplianceRuleError["code"] | RuleInterpretationError["code"], number> = {
  rule_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  update_not_found: 404,
  empty_history: 409,
  invalid_ai_response: 502,
};

function handleRuleError(reply: FastifyReply, err: unknown) {
  if (err instanceof ComplianceRuleError || err instanceof RuleInterpretationError) {
    return reply.status(ruleErrorStatus[err.code]).send({ error: err.code, message: err.message });
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

const createRuleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

const linkSchema = z.object({ updateId: z.string().min(1) });
const relatedSchema = z.object({ relatedRuleKey: z.string().min(1) });

/**
 * aiProvider is nullable -- the interpret route only gets registered
 * when it's non-null, same "AI-dependent features are optional"
 * convention as registerComplianceAnalysisRoutes in server.ts (a
 * missing ANTHROPIC_API_KEY disables the feature rather than blocking
 * every other route from starting).
 */
export function registerComplianceRulesRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  staffAuthRepo: StaffAuthRepository,
  aiProvider: AIProvider | null,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/compliance/rules", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const rules = await listRules(complianceRepo);
      return reply.status(200).send({ rules });
    });

    scopedApp.post("/v1/admin/compliance/rules", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const parsed = createRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const rule = await createRule(complianceRepo, parsed.data);
        return reply.status(201).send(rule);
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/compliance/rules/:key", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const [history, current, related] = await Promise.all([
          getRuleHistory(complianceRepo, key),
          getCurrentVersion(complianceRepo, key),
          listRelatedRules(complianceRepo, key),
        ]);
        const rule = await complianceRepo.getRuleByKey(key);
        const latestInterpretation = rule ? await complianceRepo.getLatestRuleInterpretation(rule.id) : null;
        const stale = aiProvider ? await isInterpretationStale(complianceRepo, key) : null;
        return reply
          .status(200)
          .send({ history, currentVersion: current, relatedRules: related, latestInterpretation, interpretationStale: stale });
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/rules/:key/link", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = linkSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await linkUpdateToRule(complianceRepo, parsed.data.updateId, key);
        return reply.status(204).send();
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/updates/:updateId/unlink", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { updateId } = request.params as { updateId: string };
      try {
        await unlinkUpdateFromRule(complianceRepo, updateId);
        return reply.status(204).send();
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/rules/:key/related", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = relatedSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addRelatedRule(complianceRepo, key, parsed.data.relatedRuleKey);
        return reply.status(204).send();
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/compliance/rules/:key/related/:relatedRuleKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "compliance:manage")) return;
      const { key, relatedRuleKey } = request.params as { key: string; relatedRuleKey: string };
      try {
        await removeRelatedRule(complianceRepo, key, relatedRuleKey);
        return reply.status(204).send();
      } catch (err) {
        return handleRuleError(reply, err);
      }
    });

    if (aiProvider) {
      scopedApp.post("/v1/admin/compliance/rules/:key/interpret", async (request, reply) => {
        if (!checkPermission(request, reply, "compliance:manage")) return;
        const { key } = request.params as { key: string };
        try {
          const interpretation = await synthesizeRuleInterpretation(complianceRepo, aiProvider, key);
          return reply.status(201).send(interpretation);
        } catch (err) {
          return handleRuleError(reply, err);
        }
      });
    }
  });
}
