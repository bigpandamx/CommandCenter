/**
 * Control-Plane/Threat-Intelligence admin routes: staff author/curate
 * the pattern and signature library here. Distribution to Aegis is a
 * separate, service-account-authenticated surface (serviceApi.ts's
 * GET /v1/service/threat-intelligence/*), not this file.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createThreatPattern,
  verifyThreatPattern,
  markThreatPatternFalsePositive,
  setThreatPatternActive,
  ThreatPatternError,
} from "../../../Control-Plane/Threat-Intelligence/src/threatPatterns.js";
import {
  createPromptAbuseSignature,
  setSignatureActive,
  graduateSignature,
  SignatureError,
} from "../../../Control-Plane/Threat-Intelligence/src/promptSignatures.js";
import {
  listDeletionRequests,
  approveAndExecuteDeletion,
  rejectDeletionRequest,
  DeletionRequestError,
} from "../../../Control-Plane/Threat-Intelligence/src/deletionRequests.js";
import { resolveOrgHashSalt } from "../../../Control-Plane/Threat-Intelligence/src/observations.js";
import { calculateIndustryBenchmark, listAllIndustryBenchmarks } from "../../../Control-Plane/Threat-Intelligence/src/benchmarks.js";
import { cleanupExpiredData } from "../../../Control-Plane/Threat-Intelligence/src/retentionCleanup.js";
import { computeSyncWindow, ingestVulnerabilities, listVulnerabilities, getVulnerabilityByCveId } from "../../../Control-Plane/Threat-Intelligence/src/vulnerabilityIngestion.js";
import { fetchNvdVulnerabilities } from "../../../Control-Plane/Threat-Intelligence/src/nvdAdapter.js";
import {
  ThreatActorError,
  ingestThreatActors,
  createStaffThreatActor,
  listThreatActors,
  setThreatActorActive,
  setThreatActorGeography,
} from "../../../Control-Plane/Threat-Intelligence/src/threatActorIngestion.js";
import {
  IntelligenceReportError,
  createIntelligenceReport,
  listIntelligenceReports,
  updateIntelligenceReport,
  publishIntelligenceReport,
  unpublishIntelligenceReport,
  requireReportById,
} from "../../../Control-Plane/Threat-Intelligence/src/intelligenceReports.js";
import {
  CampaignError,
  ingestCampaigns,
  createStaffCampaign,
  listCampaigns,
  setCampaignActive,
  setCampaignGeography,
} from "../../../Control-Plane/Threat-Intelligence/src/campaignIngestion.js";
import { TechniqueError, ingestTechniques, listTechniques, setTechniqueActive } from "../../../Control-Plane/Threat-Intelligence/src/techniqueIngestion.js";
import {
  MalwareError,
  ingestMalware,
  createStaffMalware,
  listMalware,
  setMalwareActive,
} from "../../../Control-Plane/Threat-Intelligence/src/malwareIngestion.js";
import { IocError, createIoc, listIocs, updateIoc, setIocActive } from "../../../Control-Plane/Threat-Intelligence/src/iocManagement.js";
import { fetchMitreCampaigns, fetchMitreThreatActors, fetchMitreTechniques, fetchMitreMalware } from "../../../Control-Plane/Threat-Intelligence/src/mitreAttackAdapter.js";
import { getCustomerGeographicFootprint, getGeographicThreatMatches } from "../../../Control-Plane/Threat-Intelligence/src/geographicIntelligence.js";
import type { ThreatIntelRepository } from "../../../Control-Plane/Threat-Intelligence/src/repository.js";
import { generateAndPublishThreatAdvisory, ThreatAdvisoryError } from "../../../Control-Plane/Threat-Intelligence/src/advisoryGeneration.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

const threatTypes = [
  "deployment_failure", "policy_violation", "audit_anomaly", "prompt_injection",
  "data_leakage", "bias_detection", "performance_degradation", "compliance_gap", "security_incident",
] as const;
const severities = ["critical", "high", "medium", "low", "info"] as const;

const createPatternSchema = z.object({
  patternId: z.string().min(1),
  patternName: z.string().min(1),
  threatType: z.enum(threatTypes),
  severity: z.enum(severities),
  description: z.string().min(1),
  attackVector: z.string().min(1),
  indicatorsOfCompromise: z.array(z.string()).optional(),
  detectionSignature: z.object({}).passthrough(),
  confidenceThreshold: z.number().optional(),
  affectedIndustries: z.array(z.string()).optional(),
  avgSeverityScore: z.number(),
  successRate: z.number().optional(),
  estimatedPrevalence: z.string().optional(),
  mitigationSteps: z.array(z.string()).optional(),
  remediationGuidance: z.string().optional(),
  externalReferences: z.array(z.string()).optional(),
  relatedPatternIds: z.array(z.string()).optional(),
});

const createSignatureSchema = z.object({
  signatureId: z.string().min(1),
  signatureName: z.string().min(1),
  category: z.string().min(1),
  patternRegex: z.string().optional(),
  patternKeywords: z.array(z.string()).optional(),
  detectionLogic: z.object({}).passthrough(),
  matchThreshold: z.number().optional(),
  severity: z.enum(severities),
  riskScore: z.number(),
  examplePrompts: z.array(z.string()).optional(),
  isExperimental: z.boolean().optional(),
  relatedThreatPatternId: z.string().optional(),
});

const vulnerabilityQuerySchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "none"]).optional(),
  isKnownExploited: z.enum(["true", "false"]).optional(),
});

const threatActorQuerySchema = z.object({
  source: z.enum(["mitre_attack", "staff_curated"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  text: z.string().optional(),
});

const createStaffThreatActorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  relatedPatternIds: z.array(z.string()).optional(),
});

const setThreatActorActiveSchema = z.object({ isActive: z.boolean() });

const setThreatActorGeographySchema = z.object({
  originCountry: z.string().nullable().optional(),
  targetedCountries: z.array(z.string()).optional(),
});

const threatActorErrorStatus: Record<ThreatActorError["code"], number> = {
  actor_not_found: 404,
};

const campaignQuerySchema = z.object({
  source: z.enum(["mitre_attack", "staff_curated"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  text: z.string().optional(),
});

const createStaffCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
  attributedActorIds: z.array(z.string()).optional(),
});

const setCampaignActiveSchema = z.object({ isActive: z.boolean() });

const setCampaignGeographySchema = z.object({
  originCountry: z.string().nullable().optional(),
  targetedCountries: z.array(z.string()).optional(),
});

const campaignErrorStatus: Record<CampaignError["code"], number> = {
  campaign_not_found: 404,
};

const techniqueQuerySchema = z.object({
  tactic: z.string().optional(),
  isSubtechnique: z.enum(["true", "false"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  text: z.string().optional(),
});

const setTechniqueActiveSchema = z.object({ isActive: z.boolean() });

const techniqueErrorStatus: Record<TechniqueError["code"], number> = {
  technique_not_found: 404,
};

const malwareQuerySchema = z.object({
  softwareType: z.enum(["malware", "tool"]).optional(),
  source: z.enum(["mitre_attack", "staff_curated"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  text: z.string().optional(),
});

const createStaffMalwareSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  softwareType: z.enum(["malware", "tool"]),
  aliases: z.array(z.string()).optional(),
});

const setMalwareActiveSchema = z.object({ isActive: z.boolean() });

const malwareErrorStatus: Record<MalwareError["code"], number> = {
  malware_not_found: 404,
};

const IOC_TYPES = ["ip", "domain", "url", "email", "file_hash_md5", "file_hash_sha1", "file_hash_sha256"] as const;

const iocQuerySchema = z.object({
  iocType: z.enum(IOC_TYPES).optional(),
  source: z.enum(["staff_curated", "threatfox"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  text: z.string().optional(),
});

const createIocSchema = z.object({
  iocType: z.enum(IOC_TYPES),
  value: z.string().min(1),
  threatType: z.string().optional(),
  description: z.string().optional(),
  relatedPatternIds: z.array(z.string()).optional(),
  relatedActorIds: z.array(z.string()).optional(),
  relatedCampaignIds: z.array(z.string()).optional(),
  relatedMalwareIds: z.array(z.string()).optional(),
  firstSeenAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
});

const updateIocSchema = z.object({
  threatType: z.string().optional(),
  description: z.string().optional(),
  relatedPatternIds: z.array(z.string()).optional(),
  relatedActorIds: z.array(z.string()).optional(),
  relatedCampaignIds: z.array(z.string()).optional(),
  relatedMalwareIds: z.array(z.string()).optional(),
  lastSeenAt: z.string().optional(),
});

const setIocActiveSchema = z.object({ isActive: z.boolean() });

const iocErrorStatus: Record<IocError["code"], number> = {
  ioc_not_found: 404,
  duplicate_ioc: 409,
};

const createIntelligenceReportSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  relatedPatternIds: z.array(z.string()).optional(),
  relatedActorIds: z.array(z.string()).optional(),
  relatedVulnerabilityCveIds: z.array(z.string()).optional(),
});

const updateIntelligenceReportSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  relatedPatternIds: z.array(z.string()).optional(),
  relatedActorIds: z.array(z.string()).optional(),
  relatedVulnerabilityCveIds: z.array(z.string()).optional(),
});

const intelligenceReportQuerySchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  text: z.string().optional(),
});

const intelligenceReportErrorStatus: Record<IntelligenceReportError["code"], number> = {
  report_not_found: 404,
};

const patternErrorStatus: Record<ThreatPatternError["code"], number> = {
  pattern_not_found: 404,
  invalid_input: 400,
  duplicate_pattern_id: 409,
};
const signatureErrorStatus: Record<SignatureError["code"], number> = {
  signature_not_found: 404,
  invalid_input: 400,
  duplicate_signature_id: 409,
};
const deletionRequestErrorStatus: Record<DeletionRequestError["code"], number> = {
  request_not_found: 404,
  already_processed: 409,
};

// Same salt-resolution approach as serviceApi.ts -- read at request time
// so a rotated ORG_HASH_SALT env var takes effect without a restart.
function currentOrgHashSalt(): string {
  return resolveOrgHashSalt(process.env.ORG_HASH_SALT);
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

export function registerThreatIntelAdminRoutes(
  app: FastifyInstance,
  repo: ThreatIntelRepository,
  announcementsRepo: AnnouncementsRepository,
  staffAuthRepo: StaffAuthRepository,
  organizationsRepo: OrganizationsRepository,
  nvdApiKey: string | null = null,
): void {
  app.register(async (scopedApp) => {
  scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

  scopedApp.post("/v1/admin/threat-intel/patterns", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createPatternSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const pattern = await createThreatPattern(repo, parsed.data as Parameters<typeof createThreatPattern>[1]);
      return reply.status(201).send(pattern);
    } catch (err) {
      if (err instanceof ThreatPatternError) {
        return reply.status(patternErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/threat-intel/patterns", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const query = request.query as { severity?: string; threatType?: string; isActive?: string; text?: string } | undefined;
    const patterns = await repo.searchPatterns({
      severity: query?.severity as Parameters<typeof repo.searchPatterns>[0]["severity"],
      threatType: query?.threatType as Parameters<typeof repo.searchPatterns>[0]["threatType"],
      isActive: query?.isActive !== undefined ? query.isActive === "true" : undefined,
      text: query?.text,
    });
    return reply.status(200).send({ patterns });
  });

  scopedApp.post("/v1/admin/threat-intel/patterns/:id/verify", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const pattern = await verifyThreatPattern(repo, id);
      return reply.status(200).send(pattern);
    } catch (err) {
      if (err instanceof ThreatPatternError) {
        return reply.status(patternErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/patterns/:id/false-positive", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const pattern = await markThreatPatternFalsePositive(repo, id);
      return reply.status(200).send(pattern);
    } catch (err) {
      if (err instanceof ThreatPatternError) {
        return reply.status(patternErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/threat-intel/patterns/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request" });
    }
    try {
      const pattern = await setThreatPatternActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(pattern);
    } catch (err) {
      if (err instanceof ThreatPatternError) {
        return reply.status(patternErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/signatures", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createSignatureSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const signature = await createPromptAbuseSignature(repo, parsed.data as Parameters<typeof createPromptAbuseSignature>[1]);
      return reply.status(201).send(signature);
    } catch (err) {
      if (err instanceof SignatureError) {
        return reply.status(signatureErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/threat-intel/signatures", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const query = request.query as { category?: string; severity?: string; isActive?: string; text?: string } | undefined;
    const signatures = await repo.searchSignatures({
      category: query?.category,
      severity: query?.severity as Parameters<typeof repo.searchSignatures>[0]["severity"],
      isActive: query?.isActive !== undefined ? query.isActive === "true" : undefined,
      text: query?.text,
    });
    return reply.status(200).send({ signatures });
  });

  scopedApp.patch("/v1/admin/threat-intel/signatures/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request" });
    }
    try {
      const signature = await setSignatureActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(signature);
    } catch (err) {
      if (err instanceof SignatureError) {
        return reply.status(signatureErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/signatures/:id/graduate", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const signature = await graduateSignature(repo, id);
      return reply.status(200).send(signature);
    } catch (err) {
      if (err instanceof SignatureError) {
        return reply.status(signatureErrorStatus[err.code]).send({ error: err.code });
      }
      throw err;
    }
  });

  scopedApp.get("/v1/admin/threat-intel/deletion-requests/:organizationId", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const { organizationId } = request.params as { organizationId: string };
    const requests = await listDeletionRequests(repo, organizationId);
    return reply.status(200).send({ requests });
  });

  scopedApp.post("/v1/admin/threat-intel/deletion-requests/:id/approve", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const staffUser = getAuthenticatedStaffUser(request);
    try {
      const result = await approveAndExecuteDeletion(repo, id, staffUser.id, currentOrgHashSalt());
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof DeletionRequestError) {
        return reply.status(deletionRequestErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/deletion-requests/:id/reject", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const staffUser = getAuthenticatedStaffUser(request);
    try {
      const result = await rejectDeletionRequest(repo, id, staffUser.id);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof DeletionRequestError) {
        return reply.status(deletionRequestErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/benchmarks/calculate", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = z
      .object({
        industry: z.string().min(1),
        metric: z.enum(["risk_score", "deployment_failure_rate", "policy_violation_rate"]),
        timeWindowDays: z.number().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const benchmark = await calculateIndustryBenchmark(
      repo,
      parsed.data.industry,
      parsed.data.metric as Parameters<typeof calculateIndustryBenchmark>[2],
      parsed.data.timeWindowDays,
    );
    if (!benchmark) {
      // Not an error -- insufficient data (below the k-anonymity floor)
      // is a legitimate, expected outcome for a new or niche segment.
      return reply.status(200).send({ benchmark: null, reason: "insufficient_data" });
    }
    return reply.status(200).send({ benchmark });
  });

  scopedApp.get("/v1/admin/threat-intel/benchmarks", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const query = request.query as { industry?: string; limit?: string } | undefined;
    const benchmarks = await listAllIndustryBenchmarks(repo, {
      industry: query?.industry,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    return reply.status(200).send({ benchmarks });
  });

  scopedApp.post("/v1/admin/threat-intel/cleanup", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const result = await cleanupExpiredData(repo);
    return reply.status(200).send(result);
  });

  // --- Vulnerabilities (CVE) ---

  scopedApp.get("/v1/admin/threat-intel/vulnerabilities", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = vulnerabilityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const isKnownExploited = parsed.data.isKnownExploited === undefined ? undefined : parsed.data.isKnownExploited === "true";
    const vulnerabilities = await listVulnerabilities(repo, { severity: parsed.data.severity as "critical" | "high" | "medium" | "low" | "none" | undefined, isKnownExploited });
    return reply.status(200).send({ vulnerabilities });
  });

  scopedApp.get("/v1/admin/threat-intel/vulnerabilities/:cveId", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const { cveId } = request.params as { cveId: string };
    const vulnerability = await getVulnerabilityByCveId(repo, cveId);
    if (!vulnerability) {
      return reply.status(404).send({ error: "vulnerability_not_found" });
    }
    return reply.status(200).send(vulnerability);
  });

  // Honestly not a live cron trigger -- the real recurring sync is the
  // "vulnerability-sync" Jobs entry (see jobRegistry.ts). This is the
  // staff-triggerable "run it now" stopgap, same pattern as
  // threat-intel/cleanup above and every other manual-trigger route in
  // this codebase.
  scopedApp.post("/v1/admin/threat-intel/vulnerabilities/sync", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const now = new Date();
    const window = await computeSyncWindow(repo, now);
    try {
      const vulnerabilities = await fetchNvdVulnerabilities(window.since, window.until, nvdApiKey ?? undefined);
      const result = await ingestVulnerabilities(repo, vulnerabilities, now);
      return reply.status(200).send({ ...result, since: window.since, until: window.until });
    } catch (err) {
      return reply.status(502).send({ error: "nvd_fetch_failed", message: err instanceof Error ? err.message : "unknown error" });
    }
  });

  // --- Threat Actors ---

  scopedApp.get("/v1/admin/threat-intel/threat-actors", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = threatActorQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const actors = await listThreatActors(repo, {
      source: parsed.data.source as "mitre_attack" | "staff_curated" | undefined,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      text: parsed.data.text,
    });
    return reply.status(200).send({ actors });
  });

  scopedApp.post("/v1/admin/threat-intel/threat-actors", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createStaffThreatActorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const actor = await createStaffThreatActor(repo, parsed.data);
    return reply.status(201).send(actor);
  });

  scopedApp.patch("/v1/admin/threat-intel/threat-actors/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setThreatActorActiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const actor = await setThreatActorActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(actor);
    } catch (err) {
      if (err instanceof ThreatActorError) {
        return reply.status(threatActorErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // The only way to tag geography on a MITRE-sourced actor, which is
  // the overwhelming majority of them -- see setThreatActorGeography's
  // own doc comment. An analyst reads MITRE's own free-text
  // description, confirms what it actually says, and tags it here.
  scopedApp.patch("/v1/admin/threat-intel/threat-actors/:id/geography", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setThreatActorGeographySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const actor = await setThreatActorGeography(repo, id, parsed.data);
      return reply.status(200).send(actor);
    } catch (err) {
      if (err instanceof ThreatActorError) {
        return reply.status(threatActorErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Honestly not a live cron trigger -- the real recurring sync is the
  // "threat-actor-sync" Jobs entry. This is the staff-triggerable "run
  // it now" stopgap, same pattern as vulnerabilities/sync above.
  scopedApp.post("/v1/admin/threat-intel/threat-actors/sync", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    try {
      const actors = await fetchMitreThreatActors();
      const result = await ingestThreatActors(repo, actors, new Date());
      return reply.status(200).send(result);
    } catch (err) {
      return reply.status(502).send({ error: "mitre_fetch_failed", message: err instanceof Error ? err.message : "unknown error" });
    }
  });

  // Threat Advisories: Threat Intelligence's own adapter onto
  // Control-Plane/Publishing -- generates a human-readable, staff-
  // reviewed draft from a verified pattern. Genuinely distinct from
  // the patterns/signatures machine feed (GET .../distribution above),
  // which has no review step and isn't human-readable at all.
  scopedApp.post("/v1/admin/threat-intel/patterns/:id/generate-advisory", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const user = getAuthenticatedStaffUser(request);
    try {
      const announcement = await generateAndPublishThreatAdvisory(repo, announcementsRepo, id, user.id);
      return reply.status(201).send(announcement);
    } catch (err) {
      if (err instanceof ThreatAdvisoryError) {
        const status = err.code === "pattern_not_found" ? 404 : 409;
        return reply.status(status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // --- Intelligence Reports ---
  //
  // A genuinely distinct concept from Threat Advisories above, not a
  // second way to do the same thing -- see intelligenceReports.ts's
  // own top comment for the full reasoning. Advisories are short,
  // tactical, mechanically generated from one verified pattern, and
  // distributed to customers. Reports are longer-form analyst prose
  // that can synthesize across many patterns/actors/CVEs at once, and
  // stay a staff knowledge-base artifact.

  scopedApp.get("/v1/admin/threat-intel/reports", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = intelligenceReportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const reports = await listIntelligenceReports(repo, {
      status: parsed.data.status as "draft" | "published" | undefined,
      text: parsed.data.text,
    });
    return reply.status(200).send({ reports });
  });

  scopedApp.get("/v1/admin/threat-intel/reports/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const { id } = request.params as { id: string };
    try {
      const report = await requireReportById(repo, id);
      return reply.status(200).send(report);
    } catch (err) {
      if (err instanceof IntelligenceReportError) {
        return reply.status(intelligenceReportErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/reports", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createIntelligenceReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const user = getAuthenticatedStaffUser(request);
    const report = await createIntelligenceReport(repo, parsed.data, user.id);
    return reply.status(201).send(report);
  });

  scopedApp.patch("/v1/admin/threat-intel/reports/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = updateIntelligenceReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const report = await updateIntelligenceReport(repo, id, parsed.data);
      return reply.status(200).send(report);
    } catch (err) {
      if (err instanceof IntelligenceReportError) {
        return reply.status(intelligenceReportErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/reports/:id/publish", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const report = await publishIntelligenceReport(repo, id);
      return reply.status(200).send(report);
    } catch (err) {
      if (err instanceof IntelligenceReportError) {
        return reply.status(intelligenceReportErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.post("/v1/admin/threat-intel/reports/:id/unpublish", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    try {
      const report = await unpublishIntelligenceReport(repo, id);
      return reply.status(200).send(report);
    } catch (err) {
      if (err instanceof IntelligenceReportError) {
        return reply.status(intelligenceReportErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // --- Campaigns ---
  //
  // MITRE ATT&CK's own Campaign STIX object type (added v12), living
  // in the exact same STIX bundle already fetched for Threat Actors
  // above -- see mitreAttackAdapter.ts's own top comment for why this
  // shares a source rather than needing a new one.

  scopedApp.get("/v1/admin/threat-intel/campaigns", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = campaignQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const campaigns = await listCampaigns(repo, {
      source: parsed.data.source as "mitre_attack" | "staff_curated" | undefined,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      text: parsed.data.text,
    });
    return reply.status(200).send({ campaigns });
  });

  scopedApp.post("/v1/admin/threat-intel/campaigns", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createStaffCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const campaign = await createStaffCampaign(repo, {
      ...parsed.data,
      firstSeen: parsed.data.firstSeen ? new Date(parsed.data.firstSeen) : undefined,
      lastSeen: parsed.data.lastSeen ? new Date(parsed.data.lastSeen) : undefined,
    });
    return reply.status(201).send(campaign);
  });

  scopedApp.patch("/v1/admin/threat-intel/campaigns/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setCampaignActiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const campaign = await setCampaignActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(campaign);
    } catch (err) {
      if (err instanceof CampaignError) {
        return reply.status(campaignErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // The only way to tag geography on a MITRE-sourced campaign -- see
  // setCampaignGeography's own doc comment.
  scopedApp.patch("/v1/admin/threat-intel/campaigns/:id/geography", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setCampaignGeographySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const campaign = await setCampaignGeography(repo, id, parsed.data);
      return reply.status(200).send(campaign);
    } catch (err) {
      if (err instanceof CampaignError) {
        return reply.status(campaignErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Honestly not a live cron trigger -- the real recurring sync is the
  // "campaign-sync" Jobs entry. This is the staff-triggerable "run it
  // now" stopgap, same pattern as threat-actors/sync above.
  scopedApp.post("/v1/admin/threat-intel/campaigns/sync", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    try {
      const campaigns = await fetchMitreCampaigns();
      const result = await ingestCampaigns(repo, campaigns, new Date());
      return reply.status(200).send(result);
    } catch (err) {
      return reply.status(502).send({ error: "mitre_fetch_failed", message: err instanceof Error ? err.message : "unknown error" });
    }
  });

  // --- Techniques ---
  //
  // MITRE ATT&CK's own technique-level taxonomy, living in the exact
  // same STIX bundle already fetched for Threat Actors and Campaigns
  // above. No staff-curated create here, unlike Actors/Campaigns --
  // techniques are MITRE's own standardized taxonomy, not something
  // staff observe locally and register a new entry for.

  scopedApp.get("/v1/admin/threat-intel/techniques", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = techniqueQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const techniques = await listTechniques(repo, {
      tactic: parsed.data.tactic,
      isSubtechnique: parsed.data.isSubtechnique === undefined ? undefined : parsed.data.isSubtechnique === "true",
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      text: parsed.data.text,
    });
    return reply.status(200).send({ techniques });
  });

  scopedApp.patch("/v1/admin/threat-intel/techniques/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setTechniqueActiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const technique = await setTechniqueActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(technique);
    } catch (err) {
      if (err instanceof TechniqueError) {
        return reply.status(techniqueErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Honestly not a live cron trigger -- the real recurring sync is the
  // "technique-sync" Jobs entry. This is the staff-triggerable "run it
  // now" stopgap, same pattern as campaigns/sync above.
  scopedApp.post("/v1/admin/threat-intel/techniques/sync", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    try {
      const techniques = await fetchMitreTechniques();
      const result = await ingestTechniques(repo, techniques, new Date());
      return reply.status(200).send(result);
    } catch (err) {
      return reply.status(502).send({ error: "mitre_fetch_failed", message: err instanceof Error ? err.message : "unknown error" });
    }
  });

  // --- Malware Intelligence ---
  //
  // MITRE ATT&CK's own "Software" category (malware + tool STIX
  // types), living in the exact same STIX bundle already fetched for
  // Threat Actors, Campaigns, and Techniques above. Unlike Techniques,
  // this DOES support staff-curated create -- a piece of malware
  // observed locally, or from a vendor report, that isn't (yet) in
  // MITRE's own catalog is a genuinely different situation from a
  // technique, which is MITRE's own standardized taxonomy end to end.

  scopedApp.get("/v1/admin/threat-intel/malware", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = malwareQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const malware = await listMalware(repo, {
      softwareType: parsed.data.softwareType as "malware" | "tool" | undefined,
      source: parsed.data.source as "mitre_attack" | "staff_curated" | undefined,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      text: parsed.data.text,
    });
    return reply.status(200).send({ malware });
  });

  scopedApp.post("/v1/admin/threat-intel/malware", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createStaffMalwareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const malware = await createStaffMalware(repo, { ...parsed.data, softwareType: parsed.data.softwareType as "malware" | "tool" });
    return reply.status(201).send(malware);
  });

  scopedApp.patch("/v1/admin/threat-intel/malware/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setMalwareActiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const malware = await setMalwareActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(malware);
    } catch (err) {
      if (err instanceof MalwareError) {
        return reply.status(malwareErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Honestly not a live cron trigger -- the real recurring sync is the
  // "malware-sync" Jobs entry. This is the staff-triggerable "run it
  // now" stopgap, same pattern as techniques/sync above.
  scopedApp.post("/v1/admin/threat-intel/malware/sync", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    try {
      const malware = await fetchMitreMalware();
      const result = await ingestMalware(repo, malware, new Date());
      return reply.status(200).send(result);
    } catch (err) {
      return reply.status(502).send({ error: "mitre_fetch_failed", message: err instanceof Error ? err.message : "unknown error" });
    }
  });

  // --- Geographic Intelligence ---
  //
  // Two real data sources combined honestly -- OrganizationProfile.country
  // (customer footprint) cross-referenced against staff-tagged
  // ThreatActor/Campaign geography. See geographicIntelligence.ts's own
  // top comment for the full reasoning, including why the match is a
  // case-insensitive text match, not a validated geographic hierarchy.
  scopedApp.get("/v1/admin/threat-intel/geography", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const matches = await getGeographicThreatMatches(organizationsRepo, repo);
    return reply.status(200).send({ matches });
  });

  scopedApp.get("/v1/admin/threat-intel/geography/footprint", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const footprint = await getCustomerGeographicFootprint(organizationsRepo);
    return reply.status(200).send({ footprint });
  });

  // --- IOC Management ---
  //
  // Structured indicators of compromise -- staff-curated only for
  // this first pass. See iocManagement.ts's own top comment and
  // 0070_iocs.sql for the full reasoning, including why an external
  // source (ThreatFox) was investigated and deliberately deferred.

  scopedApp.get("/v1/admin/threat-intel/iocs", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:read")) return;
    const parsed = iocQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const iocs = await listIocs(repo, {
      iocType: parsed.data.iocType as (typeof IOC_TYPES)[number] | undefined,
      source: parsed.data.source as "staff_curated" | "threatfox" | undefined,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      text: parsed.data.text,
    });
    return reply.status(200).send({ iocs });
  });

  scopedApp.post("/v1/admin/threat-intel/iocs", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const parsed = createIocSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const user = getAuthenticatedStaffUser(request);
    try {
      const ioc = await createIoc(
        repo,
        {
          ...parsed.data,
          iocType: parsed.data.iocType as (typeof IOC_TYPES)[number],
          firstSeenAt: parsed.data.firstSeenAt ? new Date(parsed.data.firstSeenAt) : undefined,
          lastSeenAt: parsed.data.lastSeenAt ? new Date(parsed.data.lastSeenAt) : undefined,
        },
        user.id,
      );
      return reply.status(201).send(ioc);
    } catch (err) {
      if (err instanceof IocError) {
        return reply.status(iocErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/threat-intel/iocs/:id", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = updateIocSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const ioc = await updateIoc(repo, id, {
        ...parsed.data,
        lastSeenAt: parsed.data.lastSeenAt ? new Date(parsed.data.lastSeenAt) : undefined,
      });
      return reply.status(200).send(ioc);
    } catch (err) {
      if (err instanceof IocError) {
        return reply.status(iocErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  scopedApp.patch("/v1/admin/threat-intel/iocs/:id/active", async (request, reply) => {
    if (!checkPermission(request, reply, "threat_intel:manage")) return;
    const { id } = request.params as { id: string };
    const parsed = setIocActiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const ioc = await setIocActive(repo, id, parsed.data.isActive);
      return reply.status(200).send(ioc);
    } catch (err) {
      if (err instanceof IocError) {
        return reply.status(iocErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
  });
}
