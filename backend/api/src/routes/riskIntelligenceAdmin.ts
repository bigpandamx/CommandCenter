/**
 * Control-Plane/Risk-Intelligence admin routes: staff trigger insight
 * generation for an industry, browse insights, and resolve them. Also
 * the distribution path this file's own comment once named as a
 * natural follow-up -- see notificationGeneration.ts's own doc comment
 * for why this is industry-targeted, not broadcast, and why it's
 * grounded in Aegis's own actual Risk Intelligence UX (a pull/
 * benchmark feature) rather than assumed to work like Threat
 * Intelligence's push-based advisories. Read-only for viewers,
 * generation/resolution/notice-publishing all gated by
 * risk_intel:manage.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  generateNetworkRiskInsights,
  listNetworkRiskInsights,
  resolveNetworkRiskInsight,
  RiskIntelligenceError,
} from "../../../Control-Plane/Risk-Intelligence/src/orchestrator.js";
import { generateAndPublishRiskNotices, RiskNoticeError } from "../../../Control-Plane/Risk-Intelligence/src/notificationGeneration.js";
import { assessRiskImpactForIndustry } from "../../../Control-Plane/Risk-Intelligence/src/organizationImpactService.js";
import { findOrganizationsUsingVendor } from "../../../Control-Plane/Risk-Intelligence/src/vendorImpactService.js";
import {
  CloudOutageError,
  reportOutage,
  resolveOutage,
  listOutages,
  assessOutageImpact,
  generateAndPublishOutageNotices,
} from "../../../Control-Plane/Risk-Intelligence/src/cloudOutageService.js";
import {
  RiskKnowledgeError,
  createRiskKnowledgeEntry,
  listRiskKnowledgeEntries,
  listMitigations,
  updateRiskKnowledgeEntry,
} from "../../../Control-Plane/Risk-Intelligence/src/riskKnowledgeService.js";
import {
  BusinessAssetError,
  createBusinessAsset,
  listBusinessAssetsForOrganization,
  updateBusinessAsset,
  deactivateBusinessAsset,
  reactivateBusinessAsset,
} from "../../../Control-Plane/Risk-Intelligence/src/businessAssetService.js";
import {
  AssetDependencyError,
  createAssetDependency,
  listDependenciesForAsset,
  listDependentsOfAsset,
  listAssetsDependentOnVendor,
  deleteAssetDependency,
  listTransitiveDependentsOfAsset,
} from "../../../Control-Plane/Risk-Intelligence/src/assetDependencyService.js";
import {
  PlaybookError,
  createPlaybook,
  listPlaybooks,
  updatePlaybook,
  updatePlaybookSteps,
  linkPlaybookToRiskFactor,
  unlinkPlaybookFromRiskFactor,
  listPlaybooksForRiskFactor,
  listRiskFactorsForPlaybook,
} from "../../../Control-Plane/Risk-Intelligence/src/playbookService.js";
import {
  RiskFactorError,
  createRiskFactor,
  listRiskFactors,
  classifyInsight,
  declassifyInsight,
  listRiskFactorsForInsight,
  computeRiskFactorSummary,
  listInsightsClassifiedUnderRiskFactor,
} from "../../../Control-Plane/Risk-Intelligence/src/riskFactorService.js";
import {
  RiskModelError,
  createRiskModel,
  updateRiskModel,
  listRiskModels,
} from "../../../Control-Plane/Risk-Intelligence/src/riskModelService.js";
import {
  generateRiskAssessmentSnapshot,
  listRiskAssessmentHistory,
  getLatestRiskAssessment,
} from "../../../Control-Plane/Risk-Intelligence/src/riskAssessmentService.js";
import {
  RiskTreatmentError,
  proposeRiskTreatment,
  listTreatmentsForInsight,
  listRiskTreatments,
  updateTreatmentStatus,
} from "../../../Control-Plane/Risk-Intelligence/src/riskTreatmentService.js";
import type { RiskIntelligenceRepository } from "../../../Control-Plane/Risk-Intelligence/src/repository.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import type { RiskModelParameters } from "../../../Control-Plane/Risk-Intelligence/src/types.js";

/**
 * A flat schema (every field from every detector type, all optional
 * except detectorType) plus explicit runtime validation below --
 * rather than a real discriminated union, since this sandbox's zod
 * shim doesn't model z.discriminatedUnion/z.literal (real Zod
 * supports both; a real deployment's npm-installed zod would too).
 * Produces clearer, more specific error messages than a generic union
 * mismatch would anyway -- names exactly which field is missing for
 * the detectorType given, not just "didn't match any variant."
 */
const riskModelParametersSchema = z
  .object({
    detectorType: z.enum(["anomaly", "trend", "root_cause", "correlation"]),
    minPoints1h: z.number().int().positive().optional(),
    minPoints24h: z.number().int().positive().optional(),
    minPoints7d: z.number().int().positive().optional(),
    minPoints14d: z.number().int().positive().optional(),
    baselineMinimum: z.number().optional(),
    spikeThresholdPct: z.number().optional(),
    trendThresholdPct: z.number().optional(),
    dominanceThresholdPct: z.number().optional(),
    avgScoreMinimum: z.number().optional(),
    concentrationThresholdPct: z.number().optional(),
    severityCriticalPct: z.number().optional(),
    severityHighPct: z.number().optional(),
    severityMediumPct: z.number().optional(),
    severityCriticalScore: z.number().optional(),
    severityHighScore: z.number().optional(),
    severityMediumScore: z.number().optional(),
  })
  .passthrough();

const REQUIRED_FIELDS_BY_DETECTOR_TYPE: Record<string, string[]> = {
  anomaly: ["minPoints1h", "minPoints24h", "baselineMinimum", "spikeThresholdPct", "severityCriticalPct", "severityHighPct"],
  trend: ["minPoints7d", "minPoints14d", "baselineMinimum", "trendThresholdPct", "severityHighPct", "severityMediumPct"],
  root_cause: ["minPoints24h", "dominanceThresholdPct", "severityCriticalScore", "severityHighScore", "severityMediumScore"],
  correlation: ["minPoints24h", "avgScoreMinimum", "concentrationThresholdPct", "severityHighScore"],
};

/** Confirms every field the given detectorType actually needs is present and numeric -- what the flat schema above can't itself express. Returns the missing field names, or an empty array if the shape is complete. */
function missingParameterFields(raw: Record<string, unknown>): string[] {
  const required = REQUIRED_FIELDS_BY_DETECTOR_TYPE[raw.detectorType as string] ?? [];
  return required.filter((field) => typeof raw[field] !== "number");
}

const createRiskModelSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: riskModelParametersSchema,
  isActive: z.boolean().optional(),
});

const updateRiskModelSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  parameters: riskModelParametersSchema.optional(),
  isActive: z.boolean().optional(),
});

const proposeRiskTreatmentSchema = z.object({
  treatmentType: z.enum(["avoid", "mitigate", "transfer", "accept"]),
  description: z.string().min(1),
});

const updateTreatmentStatusSchema = z.object({
  status: z.enum(["proposed", "in_progress", "completed"]),
});

const createKnowledgeEntrySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  treatmentType: z.enum(["avoid", "mitigate", "transfer", "accept"]).optional(),
});

const updateKnowledgeEntrySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

const createBusinessAssetSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  criticality: z.enum(["low", "medium", "high", "critical"]),
});

const updateBusinessAssetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
});

/**
 * Flat schema plus explicit runtime validation, same reason as
 * riskModelParametersSchema above -- this sandbox's zod shim doesn't
 * model z.discriminatedUnion/z.literal.
 */
const reportOutageSchema = z.object({
  vendor: z.string().min(1),
  category: z.enum(["cloud", "ai", "device"]),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  affectedServices: z.array(z.string()).optional(),
  startedAt: z.string(),
  sourceUrl: z.string().optional(),
});

const createAssetDependencySchema = z
  .object({
    targetType: z.enum(["asset", "vendor"]),
    targetAssetId: z.string().optional(),
    targetVendor: z.string().optional(),
    targetVendorCategory: z.enum(["cloud", "ai", "device"]).optional(),
    description: z.string().min(1),
    criticality: z.enum(["low", "medium", "high", "critical"]),
  })
  .passthrough();

const playbookStepSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

const createPlaybookSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(playbookStepSchema).optional(),
});

const updatePlaybookSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

const updatePlaybookStepsSchema = z.object({
  steps: z.array(playbookStepSchema),
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

export function registerRiskIntelligenceAdminRoutes(
  app: FastifyInstance,
  repo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  announcementsRepo: AnnouncementsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/risk-intelligence/generate", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const parsed = z.object({ industry: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const insights = await generateNetworkRiskInsights(repo, parsed.data.industry);
    return reply.status(200).send({ insights });
  });

  scopedApp.get("/v1/admin/risk-intelligence/insights", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const query = request.query as
      | { industry?: string; type?: string; severity?: string; isResolved?: string; limit?: string }
      | undefined;
    const insights = await listNetworkRiskInsights(repo, {
      industry: query?.industry,
      type: query?.type as Parameters<typeof listNetworkRiskInsights>[1]["type"],
      severity: query?.severity as Parameters<typeof listNetworkRiskInsights>[1]["severity"],
      isResolved: query?.isResolved !== undefined ? query.isResolved === "true" : undefined,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ insights });
  });

  scopedApp.get("/v1/admin/risk-intelligence/insights/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    const insight = await repo.getInsightById(id);
    if (!insight) {
      return reply.status(404).send({ error: "insight_not_found", message: `No insight with id "${id}"` });
    }
    return reply.status(200).send(insight);
  });

  scopedApp.post("/v1/admin/risk-intelligence/insights/:id/resolve", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      await resolveNetworkRiskInsight(repo, id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof RiskIntelligenceError) {
        return reply.status(404).send({ error: err.code });
      }
      throw err;
    }
  });

  // Organization Impact: preview who a given insight's industry would
  // reach BEFORE actually generating notices -- see
  // organizationImpactService.ts's own doc comment for why this stays
  // industry-level rather than growing more precise the way
  // Compliance's own impact assessment did.
  scopedApp.get("/v1/admin/risk-intelligence/insights/:id/impact", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    const insight = await repo.getInsightById(id);
    if (!insight) {
      return reply.status(404).send({ error: "insight_not_found", message: `No insight with id "${id}"` });
    }
    const impact = await assessRiskImpactForIndustry(orgsRepo, insight.industry);
    return reply.status(200).send({ industry: insight.industry, impact });
  });

  // Vendor Impact: "who uses OpenAI" -- see vendorImpactService.ts's
  // own doc comment for why this is genuinely more precise than
  // industry-level matching, and why it doesn't conflict with the
  // privacy boundary the industry-impact route above operates under.
  scopedApp.get("/v1/admin/risk-intelligence/vendor-impact", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const query = request.query as { vendor?: string; category?: string } | undefined;
    if (!query?.vendor || !query?.category) {
      return reply.status(400).send({ error: "invalid_request", message: "Both vendor and category query params are required." });
    }
    if (!["cloud", "ai", "device"].includes(query.category)) {
      return reply.status(400).send({ error: "invalid_request", message: 'category must be "cloud", "ai", or "device".' });
    }
    const impact = await findOrganizationsUsingVendor(orgsRepo, query.vendor, query.category as "cloud" | "ai" | "device");
    return reply.status(200).send({ vendor: query.vendor, category: query.category, impact });
  });

  // Risk Notices: industry-targeted, staff-reviewed distribution --
  // see notificationGeneration.ts's own doc comment for the full
  // reasoning, including why this is grounded in Aegis's own actual
  // Risk Intelligence UX rather than assumed to mirror Threat
  // Advisories' broadcast model.
  scopedApp.post("/v1/admin/risk-intelligence/insights/:id/generate-notice", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const user = getAuthenticatedStaffUser(request);
    try {
      const announcements = await generateAndPublishRiskNotices(repo, orgsRepo, announcementsRepo, id, user.id);
      return reply.status(201).send({ announcements });
    } catch (err) {
      if (err instanceof RiskNoticeError) {
        const status = err.code === "insight_not_found" ? 404 : 409;
        return reply.status(status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Risk Factors: a classification taxonomy, not a requirement
  // hierarchy -- see riskFactorService.ts's own doc comment.
  scopedApp.get("/v1/admin/risk-intelligence/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const factors = await listRiskFactors(repo);
    return reply.status(200).send({ riskFactors: factors });
  });

  scopedApp.get("/v1/admin/risk-intelligence/risk-factors/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    const factor = await repo.getRiskFactorByKey(key);
    if (!factor) {
      return reply.status(404).send({ error: "risk_factor_not_found", message: `No risk factor with key "${key}"` });
    }
    return reply.status(200).send(factor);
  });

  scopedApp.post("/v1/admin/risk-intelligence/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const parsed = z.object({ key: z.string().min(1), name: z.string().min(1), description: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const factor = await createRiskFactor(repo, parsed.data);
      return reply.status(201).send(factor);
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(err.code === "duplicate_key" ? 409 : 400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/risk-factors/:key/summary", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    try {
      const summary = await computeRiskFactorSummary(repo, key);
      return reply.status(200).send(summary);
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/risk-factors/:key/insights", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    try {
      const insights = await listInsightsClassifiedUnderRiskFactor(repo, key);
      return reply.status(200).send({ insights });
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/insights/:id/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const factors = await listRiskFactorsForInsight(repo, id);
      return reply.status(200).send({ riskFactors: factors });
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/insights/:id/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = z.object({ riskFactorKey: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      await classifyInsight(repo, id, parsed.data.riskFactorKey);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/insights/:id/risk-factors/:riskFactorKey/remove", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id, riskFactorKey } = request.params as { id: string; riskFactorKey: string };
    try {
      await declassifyInsight(repo, id, riskFactorKey);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof RiskFactorError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Risk Models: detectors.ts's own already-proven thresholds, made
  // into a real, staff-editable configuration -- see
  // riskModelService.ts's own doc comment.
  scopedApp.get("/v1/admin/risk-intelligence/risk-models", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const models = await listRiskModels(repo);
    return reply.status(200).send({ riskModels: models });
  });

  scopedApp.get("/v1/admin/risk-intelligence/risk-models/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    const model = await repo.getRiskModelByKey(key);
    if (!model) {
      return reply.status(404).send({ error: "risk_model_not_found", message: `No risk model with key "${key}"` });
    }
    return reply.status(200).send(model);
  });

  scopedApp.post("/v1/admin/risk-intelligence/risk-models", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const parsed = createRiskModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const missing = missingParameterFields(parsed.data.parameters as unknown as Record<string, unknown>);
    if (missing.length > 0) {
      return reply.status(400).send({
        error: "invalid_request",
        message: `Missing or non-numeric fields for detectorType "${parsed.data.parameters.detectorType}": ${missing.join(", ")}`,
      });
    }
    try {
      const model = await createRiskModel(repo, {
        ...parsed.data,
        parameters: parsed.data.parameters as unknown as RiskModelParameters,
      });
      return reply.status(201).send(model);
    } catch (err) {
      if (err instanceof RiskModelError) {
        return reply.status(err.code === "duplicate_key" ? 409 : 400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/risk-models/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = updateRiskModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    if (parsed.data.parameters) {
      const missing = missingParameterFields(parsed.data.parameters as unknown as Record<string, unknown>);
      if (missing.length > 0) {
        return reply.status(400).send({
          error: "invalid_request",
          message: `Missing or non-numeric fields for detectorType "${parsed.data.parameters.detectorType}": ${missing.join(", ")}`,
        });
      }
    }
    try {
      const model = await updateRiskModel(repo, key, {
        ...parsed.data,
        parameters: parsed.data.parameters as unknown as RiskModelParameters | undefined,
      });
      return reply.status(200).send(model);
    } catch (err) {
      if (err instanceof RiskModelError) {
        const status = err.code === "risk_model_not_found" ? 404 : 400;
        return reply.status(status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Risk Assessments: persisted exposure snapshots -- the scheduled
  // job (Jobs' own "Risk Assessment Snapshot") is the normal way these
  // get created; this manual route exists for the same "staff can
  // force an immediate check" reason every other scheduled job in
  // this codebase has one.
  scopedApp.post("/v1/admin/risk-intelligence/industries/:industry/assess", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { industry } = request.params as { industry: string };
    const assessment = await generateRiskAssessmentSnapshot(repo, industry);
    return reply.status(201).send(assessment);
  });

  scopedApp.get("/v1/admin/risk-intelligence/industries/:industry/assessments", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { industry } = request.params as { industry: string };
    const query = request.query as { limit?: string } | undefined;
    const assessments = await listRiskAssessmentHistory(repo, industry, {
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ assessments });
  });

  scopedApp.get("/v1/admin/risk-intelligence/industries/:industry/assessments/latest", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { industry } = request.params as { industry: string };
    const assessment = await getLatestRiskAssessment(repo, industry);
    if (!assessment) {
      return reply.status(404).send({ error: "no_assessment_yet", message: `No risk assessment has ever been recorded for "${industry}"` });
    }
    return reply.status(200).send(assessment);
  });

  // Risk Treatments: see riskTreatmentService.ts's own doc comment.
  // "accept" is proposed the exact same way avoid/mitigate/transfer
  // are -- there's no separate "just close this out" action, because
  // accepting the risk genuinely IS a treatment, not an absence of
  // one.
  scopedApp.get("/v1/admin/risk-intelligence/insights/:id/treatments", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const treatments = await listTreatmentsForInsight(repo, id);
      return reply.status(200).send({ treatments });
    } catch (err) {
      if (err instanceof RiskTreatmentError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/insights/:id/treatments", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = proposeRiskTreatmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const user = getAuthenticatedStaffUser(request);
    try {
      const treatment = await proposeRiskTreatment(repo, {
        insightId: id,
        treatmentType: parsed.data.treatmentType as "avoid" | "mitigate" | "transfer" | "accept",
        description: parsed.data.description,
        proposedByStaffId: user.id,
      });
      return reply.status(201).send(treatment);
    } catch (err) {
      if (err instanceof RiskTreatmentError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/treatments", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const query = request.query as { treatmentType?: string; status?: string; limit?: string } | undefined;
    const treatments = await listRiskTreatments(repo, {
      treatmentType: query?.treatmentType as never,
      status: query?.status as never,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ treatments });
  });

  scopedApp.post("/v1/admin/risk-intelligence/treatments/:id/status", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = updateTreatmentStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const treatment = await updateTreatmentStatus(repo, id, parsed.data.status as "proposed" | "in_progress" | "completed");
      return reply.status(200).send(treatment);
    } catch (err) {
      if (err instanceof RiskTreatmentError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Risk Knowledge: the platform-wide catalogs -- see
  // riskKnowledgeService.ts's own doc comment for why "Mitigations"
  // isn't a separate category, and why Business Assets/Dependencies
  // (named alongside these in the original proposal) aren't included
  // at all.
  scopedApp.get("/v1/admin/risk-intelligence/knowledge/:category", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { category } = request.params as { category: string };
    if (!["threat_type", "risk_type", "treatment", "industry"].includes(category)) {
      return reply.status(400).send({ error: "invalid_category", message: 'category must be "threat_type", "risk_type", "treatment", or "industry".' });
    }
    const entries = await listRiskKnowledgeEntries(repo, category as "threat_type" | "risk_type" | "treatment" | "industry");
    return reply.status(200).send({ entries });
  });

  // "Mitigations" specifically -- a filtered view of treatment entries, not its own storage.
  scopedApp.get("/v1/admin/risk-intelligence/knowledge/treatment/mitigations", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const entries = await listMitigations(repo);
    return reply.status(200).send({ entries });
  });

  scopedApp.post("/v1/admin/risk-intelligence/knowledge/:category", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { category } = request.params as { category: string };
    if (!["threat_type", "risk_type", "treatment", "industry"].includes(category)) {
      return reply.status(400).send({ error: "invalid_category", message: 'category must be "threat_type", "risk_type", "treatment", or "industry".' });
    }
    const parsed = createKnowledgeEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const entry = await createRiskKnowledgeEntry(repo, {
        category: category as "threat_type" | "risk_type" | "treatment" | "industry",
        key: parsed.data.key,
        name: parsed.data.name,
        description: parsed.data.description,
        treatmentType: parsed.data.treatmentType as "avoid" | "mitigate" | "transfer" | "accept" | undefined,
      });
      return reply.status(201).send(entry);
    } catch (err) {
      if (err instanceof RiskKnowledgeError) {
        const status = err.code === "duplicate_key" ? 409 : 400;
        return reply.status(status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/knowledge/:category/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { category, key } = request.params as { category: string; key: string };
    if (!["threat_type", "risk_type", "treatment", "industry"].includes(category)) {
      return reply.status(400).send({ error: "invalid_category", message: 'category must be "threat_type", "risk_type", "treatment", or "industry".' });
    }
    const parsed = updateKnowledgeEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const entry = await updateRiskKnowledgeEntry(repo, category as "threat_type" | "risk_type" | "treatment" | "industry", key, parsed.data);
      return reply.status(200).send(entry);
    } catch (err) {
      if (err instanceof RiskKnowledgeError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Business Assets: an organization's own inventory -- see
  // businessAssetService.ts's own doc comment for why this is
  // org-scoped, not part of Risk Knowledge's shared catalog.
  scopedApp.get("/v1/admin/organizations/:organizationId/business-assets", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const query = request.query as { activeOnly?: string } | undefined;
    try {
      const assets = await listBusinessAssetsForOrganization(repo, orgsRepo, organizationId, {
        activeOnly: query?.activeOnly === "true",
      });
      return reply.status(200).send({ assets });
    } catch (err) {
      if (err instanceof BusinessAssetError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/organizations/:organizationId/business-assets", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { organizationId } = request.params as { organizationId: string };
    const parsed = createBusinessAssetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const asset = await createBusinessAsset(repo, orgsRepo, {
        organizationId,
        ...parsed.data,
        criticality: parsed.data.criticality as "low" | "medium" | "high" | "critical",
      });
      return reply.status(201).send(asset);
    } catch (err) {
      if (err instanceof BusinessAssetError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/business-assets/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = updateBusinessAssetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const asset = await updateBusinessAsset(repo, id, {
        ...parsed.data,
        criticality: parsed.data.criticality as "low" | "medium" | "high" | "critical" | undefined,
      });
      return reply.status(200).send(asset);
    } catch (err) {
      if (err instanceof BusinessAssetError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/business-assets/:id/deactivate", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const asset = await deactivateBusinessAsset(repo, id);
      return reply.status(200).send(asset);
    } catch (err) {
      if (err instanceof BusinessAssetError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/business-assets/:id/reactivate", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const asset = await reactivateBusinessAsset(repo, id);
      return reply.status(200).send(asset);
    } catch (err) {
      if (err instanceof BusinessAssetError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Asset Dependencies: the relationship layer -- see
  // assetDependencyService.ts's own doc comment for the full
  // reasoning, including why cascade queries here go exactly one hop
  // deep.
  scopedApp.get("/v1/admin/business-assets/:id/dependencies", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const dependencies = await listDependenciesForAsset(repo, id);
      return reply.status(200).send({ dependencies });
    } catch (err) {
      if (err instanceof AssetDependencyError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/business-assets/:id/dependents", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const dependents = await listDependentsOfAsset(repo, id);
      return reply.status(200).send({ dependents });
    } catch (err) {
      if (err instanceof AssetDependencyError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // The multi-hop cascade -- "if this asset goes down, what else
  // breaks, directly or through any number of intermediate assets."
  // See assetDependencyService.ts's own doc comment on
  // listTransitiveDependentsOfAsset for the cycle-safety and
  // shortest-path guarantees this relies on.
  scopedApp.get("/v1/admin/business-assets/:id/cascade", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    const query = request.query as { maxDepth?: string } | undefined;
    const cascade = await listTransitiveDependentsOfAsset(repo, id, {
      maxDepth: query?.maxDepth ? Number(query.maxDepth) : undefined,
    });
    return reply.status(200).send({ cascade });
  });

  scopedApp.post("/v1/admin/business-assets/:id/dependencies", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = createAssetDependencySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { targetType, targetAssetId, targetVendor, targetVendorCategory, description } = parsed.data;
    const criticality = parsed.data.criticality as "low" | "medium" | "high" | "critical";
    if (targetType === "asset" && !targetAssetId) {
      return reply.status(400).send({ error: "invalid_request", message: 'targetAssetId is required when targetType is "asset".' });
    }
    if (targetType === "vendor" && (!targetVendor || !targetVendorCategory)) {
      return reply.status(400).send({ error: "invalid_request", message: 'targetVendor and targetVendorCategory are required when targetType is "vendor".' });
    }
    try {
      const dependency = await createAssetDependency(
        repo,
        targetType === "asset"
          ? { dependentAssetId: id, targetType: "asset", targetAssetId: targetAssetId as string, description, criticality }
          : {
              dependentAssetId: id,
              targetType: "vendor",
              targetVendor: targetVendor as string,
              targetVendorCategory: targetVendorCategory as "cloud" | "ai" | "device",
              description,
              criticality,
            },
      );
      return reply.status(201).send(dependency);
    } catch (err) {
      if (err instanceof AssetDependencyError) {
        const status = err.code === "reverse_dependency_exists" ? 409 : err.code.includes("not_found") ? 404 : 400;
        return reply.status(status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/asset-dependencies/:id/delete", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      await deleteAssetDependency(repo, id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof AssetDependencyError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // The vendor-outage cascade query itself -- "if this vendor goes
  // down, which specific systems in this organization are directly
  // affected."
  scopedApp.get("/v1/admin/organizations/:organizationId/vendor-dependents", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const query = request.query as { vendor?: string; category?: string } | undefined;
    if (!query?.vendor || !query?.category) {
      return reply.status(400).send({ error: "invalid_request", message: "Both vendor and category query params are required." });
    }
    if (!["cloud", "ai", "device"].includes(query.category)) {
      return reply.status(400).send({ error: "invalid_request", message: 'category must be "cloud", "ai", or "device".' });
    }
    const dependents = await listAssetsDependentOnVendor(repo, organizationId, query.vendor, query.category as "cloud" | "ai" | "device");
    return reply.status(200).send({ vendor: query.vendor, category: query.category, dependents });
  });

  // Playbooks: ordered response procedures -- see playbookService.ts's
  // own doc comment for why this is its own concept, not a fifth Risk
  // Knowledge category.
  scopedApp.get("/v1/admin/risk-intelligence/playbooks", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const playbooks = await listPlaybooks(repo);
    return reply.status(200).send({ playbooks });
  });

  scopedApp.get("/v1/admin/risk-intelligence/playbooks/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    const playbook = await repo.getPlaybookByKey(key);
    if (!playbook) {
      return reply.status(404).send({ error: "playbook_not_found", message: `No playbook with key "${key}"` });
    }
    return reply.status(200).send(playbook);
  });

  scopedApp.post("/v1/admin/risk-intelligence/playbooks", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const parsed = createPlaybookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const playbook = await createPlaybook(repo, parsed.data);
      return reply.status(201).send(playbook);
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(err.code === "duplicate_key" ? 409 : 400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/playbooks/:key", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = updatePlaybookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const playbook = await updatePlaybook(repo, key, parsed.data);
      return reply.status(200).send(playbook);
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/playbooks/:key/steps", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = updatePlaybookStepsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const playbook = await updatePlaybookSteps(repo, key, parsed.data.steps);
      return reply.status(200).send(playbook);
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/risk-factors/:key/playbooks", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    try {
      const playbooks = await listPlaybooksForRiskFactor(repo, key);
      return reply.status(200).send({ playbooks });
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/playbooks/:key/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { key } = request.params as { key: string };
    try {
      const riskFactors = await listRiskFactorsForPlaybook(repo, key);
      return reply.status(200).send({ riskFactors });
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/playbooks/:key/risk-factors", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { key } = request.params as { key: string };
    const parsed = z.object({ riskFactorKey: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      await linkPlaybookToRiskFactor(repo, key, parsed.data.riskFactorKey);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/risk-intelligence/playbooks/:key/risk-factors/:riskFactorKey/remove", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { key, riskFactorKey } = request.params as { key: string; riskFactorKey: string };
    try {
      await unlinkPlaybookFromRiskFactor(repo, key, riskFactorKey);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof PlaybookError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Cloud/AI Provider Outages: see cloudOutageService.ts's own doc
  // comment for why this is staff-reported, and for what
  // assessOutageImpact actually realizes -- the original "critical
  // OpenAI outage -> who uses OpenAI -> elevated risk" scenario.
  scopedApp.get("/v1/admin/risk-intelligence/outages", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const query = request.query as { vendor?: string; category?: string; isResolved?: string } | undefined;
    const outages = await listOutages(repo, {
      vendor: query?.vendor,
      category: query?.category as "cloud" | "ai" | "device" | undefined,
      isResolved: query?.isResolved !== undefined ? query.isResolved === "true" : undefined,
    });
    return reply.status(200).send({ outages });
  });

  scopedApp.get("/v1/admin/risk-intelligence/outages/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    const outage = await repo.getCloudProviderOutageById(id);
    if (!outage) {
      return reply.status(404).send({ error: "outage_not_found", message: `No outage with id "${id}"` });
    }
    return reply.status(200).send(outage);
  });

  scopedApp.post("/v1/admin/risk-intelligence/outages", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const parsed = reportOutageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const user = getAuthenticatedStaffUser(request);
    const { outage, insight } = await reportOutage(repo, {
      vendor: parsed.data.vendor,
      category: parsed.data.category as "cloud" | "ai" | "device",
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity as "critical" | "high" | "medium" | "low",
      affectedServices: parsed.data.affectedServices ?? [],
      startedAt: new Date(parsed.data.startedAt),
      sourceUrl: parsed.data.sourceUrl,
      reportedByStaffId: user.id,
    });
    return reply.status(201).send({ outage, insight });
  });

  scopedApp.post("/v1/admin/risk-intelligence/outages/:id/resolve", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const outage = await resolveOutage(repo, id);
      return reply.status(200).send(outage);
    } catch (err) {
      if (err instanceof CloudOutageError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/risk-intelligence/outages/:id/impact", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const impact = await assessOutageImpact(repo, orgsRepo, id);
      return reply.status(200).send(impact);
    } catch (err) {
      if (err instanceof CloudOutageError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Distribution -- the actual gap this round closes. See
  // cloudOutageService.ts's own doc comment on
  // generateAndPublishOutageNotices for why this exists here, and why
  // CVE/MITRE-campaign-derived insights don't get an equivalent route.
  scopedApp.post("/v1/admin/risk-intelligence/outages/:id/generate-notices", async (request, reply) => {
    if (!checkPermission(request, reply, "risk_intel:manage")) return;
    const { id } = request.params as { id: string };
    const user = getAuthenticatedStaffUser(request);
    try {
      const announcements = await generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, id, user.id);
      return reply.status(201).send({ announcements });
    } catch (err) {
      if (err instanceof CloudOutageError) {
        return reply.status(404).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
  });
}
