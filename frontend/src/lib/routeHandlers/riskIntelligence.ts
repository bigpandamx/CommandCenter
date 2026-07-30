import {
  resolveInsight,
  classifyInsight,
  declassifyInsight,
  proposeTreatment,
  createRiskFactor,
  createRiskModel,
  updateRiskModel,
  triggerRiskAssessment,
  createRiskKnowledgeEntry,
  updateRiskKnowledgeEntry,
  createBusinessAsset,
  updateBusinessAsset,
  deactivateBusinessAsset,
  reactivateBusinessAsset,
  createPlaybook,
  updatePlaybook,
  updatePlaybookSteps,
  linkPlaybookToRiskFactor,
  unlinkPlaybookFromRiskFactor,
  reportOutage,
  resolveOutage,
  generateOutageNotices,
  type RiskTreatmentType,
  type RiskModelParameters,
  type RiskKnowledgeCategory,
  type AssetCriticality,
  type PlaybookStep,
  type OutageVendorCategory,
  type InsightSeverity,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { notAuthenticated, toRouteResult, invalidRequest, type RouteResult } from "../routeHandler";

export async function handleResolveInsight(sessionToken: string | null, insightId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => resolveInsight(apiClientConfig(sessionToken), insightId), 200);
}

export async function handleClassifyInsight(sessionToken: string | null, insightId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { riskFactorKey?: unknown } | null;
  if (!parsed || typeof parsed.riskFactorKey !== "string" || parsed.riskFactorKey.length === 0) {
    return invalidRequest();
  }
  return toRouteResult(() => classifyInsight(apiClientConfig(sessionToken), insightId, parsed.riskFactorKey as string), 200);
}

export async function handleDeclassifyInsight(sessionToken: string | null, insightId: string, riskFactorKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => declassifyInsight(apiClientConfig(sessionToken), insightId, riskFactorKey), 200);
}

const TREATMENT_TYPES: RiskTreatmentType[] = ["avoid", "mitigate", "transfer", "accept"];

export async function handleProposeTreatment(sessionToken: string | null, insightId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { treatmentType?: unknown; description?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.treatmentType !== "string" ||
    !TREATMENT_TYPES.includes(parsed.treatmentType as RiskTreatmentType) ||
    typeof parsed.description !== "string" ||
    parsed.description.length === 0
  ) {
    return invalidRequest();
  }
  return toRouteResult(
    () => proposeTreatment(apiClientConfig(sessionToken), insightId, { treatmentType: parsed.treatmentType as RiskTreatmentType, description: parsed.description as string }),
    201,
  );
}

export async function handleCreateRiskFactor(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.key !== "string" ||
    parsed.key.length === 0 ||
    typeof parsed.name !== "string" ||
    parsed.name.length === 0 ||
    typeof parsed.description !== "string" ||
    parsed.description.length === 0
  ) {
    return invalidRequest();
  }
  return toRouteResult(
    () => createRiskFactor(apiClientConfig(sessionToken), { key: parsed.key as string, name: parsed.name as string, description: parsed.description as string }),
    201,
  );
}

const REQUIRED_FIELDS_BY_DETECTOR_TYPE: Record<string, string[]> = {
  anomaly: ["minPoints1h", "minPoints24h", "baselineMinimum", "spikeThresholdPct", "severityCriticalPct", "severityHighPct"],
  trend: ["minPoints7d", "minPoints14d", "baselineMinimum", "trendThresholdPct", "severityHighPct", "severityMediumPct"],
  root_cause: ["minPoints24h", "dominanceThresholdPct", "severityCriticalScore", "severityHighScore", "severityMediumScore"],
  correlation: ["minPoints24h", "avgScoreMinimum", "concentrationThresholdPct", "severityHighScore"],
};

/** A flat-body check mirroring the same reasoning the backend's own riskModelParametersSchema uses -- validate that whichever detectorType was given actually carries every numeric field that type needs, rather than trusting the client sent a well-formed discriminated union. */
function parseRiskModelParameters(raw: unknown): RiskModelParameters | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const detectorType = obj.detectorType;
  if (typeof detectorType !== "string" || !(detectorType in REQUIRED_FIELDS_BY_DETECTOR_TYPE)) return null;
  const required = REQUIRED_FIELDS_BY_DETECTOR_TYPE[detectorType]!;
  for (const field of required) {
    if (typeof obj[field] !== "number") return null;
  }
  return obj as unknown as RiskModelParameters;
}

export async function handleCreateRiskModel(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown; parameters?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || parsed.key.length === 0 || typeof parsed.name !== "string" || parsed.name.length === 0 || typeof parsed.description !== "string" || parsed.description.length === 0) {
    return invalidRequest();
  }
  const parameters = parseRiskModelParameters(parsed.parameters);
  if (!parameters) return invalidRequest();
  return toRouteResult(
    () => createRiskModel(apiClientConfig(sessionToken), { key: parsed.key as string, name: parsed.name as string, description: parsed.description as string, parameters }),
    201,
  );
}

export async function handleUpdateRiskModel(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { name?: unknown; description?: unknown; parameters?: unknown; isActive?: unknown } | null;
  if (!parsed) return invalidRequest();
  const updates: { name?: string; description?: string; parameters?: RiskModelParameters; isActive?: boolean } = {};
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== "string") return invalidRequest();
    updates.name = parsed.name;
  }
  if (parsed.description !== undefined) {
    if (typeof parsed.description !== "string") return invalidRequest();
    updates.description = parsed.description;
  }
  if (parsed.isActive !== undefined) {
    if (typeof parsed.isActive !== "boolean") return invalidRequest();
    updates.isActive = parsed.isActive;
  }
  if (parsed.parameters !== undefined) {
    const parameters = parseRiskModelParameters(parsed.parameters);
    if (!parameters) return invalidRequest();
    updates.parameters = parameters;
  }
  return toRouteResult(() => updateRiskModel(apiClientConfig(sessionToken), key, updates), 200);
}

export async function handleTriggerRiskAssessment(sessionToken: string | null, industry: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => triggerRiskAssessment(apiClientConfig(sessionToken), industry), 201);
}

const KNOWLEDGE_CATEGORIES: RiskKnowledgeCategory[] = ["threat_type", "risk_type", "treatment", "industry"];

export async function handleCreateRiskKnowledgeEntry(sessionToken: string | null, category: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  if (!KNOWLEDGE_CATEGORIES.includes(category as RiskKnowledgeCategory)) return invalidRequest();
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown; treatmentType?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || parsed.key.length === 0 || typeof parsed.name !== "string" || parsed.name.length === 0 || typeof parsed.description !== "string" || parsed.description.length === 0) {
    return invalidRequest();
  }
  if (parsed.treatmentType !== undefined && !TREATMENT_TYPES.includes(parsed.treatmentType as RiskTreatmentType)) {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      createRiskKnowledgeEntry(apiClientConfig(sessionToken), category as RiskKnowledgeCategory, {
        key: parsed.key as string,
        name: parsed.name as string,
        description: parsed.description as string,
        treatmentType: parsed.treatmentType as RiskTreatmentType | undefined,
      }),
    201,
  );
}

export async function handleUpdateRiskKnowledgeEntry(sessionToken: string | null, category: string, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  if (!KNOWLEDGE_CATEGORIES.includes(category as RiskKnowledgeCategory)) return invalidRequest();
  const parsed = body as { name?: unknown; description?: unknown } | null;
  if (!parsed) return invalidRequest();
  const updates: { name?: string; description?: string } = {};
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== "string") return invalidRequest();
    updates.name = parsed.name;
  }
  if (parsed.description !== undefined) {
    if (typeof parsed.description !== "string") return invalidRequest();
    updates.description = parsed.description;
  }
  return toRouteResult(() => updateRiskKnowledgeEntry(apiClientConfig(sessionToken), category as RiskKnowledgeCategory, key, updates), 200);
}

const ASSET_CRITICALITIES: AssetCriticality[] = ["low", "medium", "high", "critical"];

export async function handleCreateBusinessAsset(sessionToken: string | null, organizationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { name?: unknown; description?: unknown; category?: unknown; criticality?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.name !== "string" ||
    parsed.name.length === 0 ||
    typeof parsed.description !== "string" ||
    parsed.description.length === 0 ||
    typeof parsed.category !== "string" ||
    parsed.category.length === 0 ||
    typeof parsed.criticality !== "string" ||
    !ASSET_CRITICALITIES.includes(parsed.criticality as AssetCriticality)
  ) {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      createBusinessAsset(apiClientConfig(sessionToken), organizationId, {
        name: parsed.name as string,
        description: parsed.description as string,
        category: parsed.category as string,
        criticality: parsed.criticality as AssetCriticality,
      }),
    201,
  );
}

export async function handleUpdateBusinessAsset(sessionToken: string | null, assetId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { name?: unknown; description?: unknown; category?: unknown; criticality?: unknown } | null;
  if (!parsed) return invalidRequest();
  const updates: { name?: string; description?: string; category?: string; criticality?: AssetCriticality } = {};
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== "string") return invalidRequest();
    updates.name = parsed.name;
  }
  if (parsed.description !== undefined) {
    if (typeof parsed.description !== "string") return invalidRequest();
    updates.description = parsed.description;
  }
  if (parsed.category !== undefined) {
    if (typeof parsed.category !== "string") return invalidRequest();
    updates.category = parsed.category;
  }
  if (parsed.criticality !== undefined) {
    if (typeof parsed.criticality !== "string" || !ASSET_CRITICALITIES.includes(parsed.criticality as AssetCriticality)) return invalidRequest();
    updates.criticality = parsed.criticality as AssetCriticality;
  }
  return toRouteResult(() => updateBusinessAsset(apiClientConfig(sessionToken), assetId, updates), 200);
}

export async function handleDeactivateBusinessAsset(sessionToken: string | null, assetId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => deactivateBusinessAsset(apiClientConfig(sessionToken), assetId), 200);
}

export async function handleReactivateBusinessAsset(sessionToken: string | null, assetId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => reactivateBusinessAsset(apiClientConfig(sessionToken), assetId), 200);
}

function parsePlaybookSteps(raw: unknown): PlaybookStep[] | null {
  if (!Array.isArray(raw)) return null;
  const steps: PlaybookStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const step = item as Record<string, unknown>;
    if (typeof step.title !== "string" || step.title.length === 0 || typeof step.description !== "string" || step.description.length === 0) {
      return null;
    }
    steps.push({ title: step.title, description: step.description });
  }
  return steps;
}

export async function handleCreatePlaybook(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown; steps?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || parsed.key.length === 0 || typeof parsed.name !== "string" || parsed.name.length === 0 || typeof parsed.description !== "string" || parsed.description.length === 0) {
    return invalidRequest();
  }
  let steps: PlaybookStep[] | undefined;
  if (parsed.steps !== undefined) {
    const parsedSteps = parsePlaybookSteps(parsed.steps);
    if (!parsedSteps) return invalidRequest();
    steps = parsedSteps;
  }
  return toRouteResult(
    () => createPlaybook(apiClientConfig(sessionToken), { key: parsed.key as string, name: parsed.name as string, description: parsed.description as string, steps }),
    201,
  );
}

export async function handleUpdatePlaybook(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { name?: unknown; description?: unknown } | null;
  if (!parsed) return invalidRequest();
  const updates: { name?: string; description?: string } = {};
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== "string") return invalidRequest();
    updates.name = parsed.name;
  }
  if (parsed.description !== undefined) {
    if (typeof parsed.description !== "string") return invalidRequest();
    updates.description = parsed.description;
  }
  return toRouteResult(() => updatePlaybook(apiClientConfig(sessionToken), key, updates), 200);
}

export async function handleUpdatePlaybookSteps(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { steps?: unknown } | null;
  const steps = parsePlaybookSteps(parsed?.steps);
  if (!steps) return invalidRequest();
  return toRouteResult(() => updatePlaybookSteps(apiClientConfig(sessionToken), key, steps), 200);
}

export async function handleLinkPlaybookToRiskFactor(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { riskFactorKey?: unknown } | null;
  if (!parsed || typeof parsed.riskFactorKey !== "string" || parsed.riskFactorKey.length === 0) return invalidRequest();
  return toRouteResult(() => linkPlaybookToRiskFactor(apiClientConfig(sessionToken), key, parsed.riskFactorKey as string), 200);
}

export async function handleUnlinkPlaybookFromRiskFactor(sessionToken: string | null, key: string, riskFactorKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => unlinkPlaybookFromRiskFactor(apiClientConfig(sessionToken), key, riskFactorKey), 200);
}

const OUTAGE_CATEGORIES: OutageVendorCategory[] = ["cloud", "ai", "device"];
const INSIGHT_SEVERITIES: InsightSeverity[] = ["critical", "high", "medium", "low"];

export async function handleReportOutage(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as {
    vendor?: unknown;
    category?: unknown;
    title?: unknown;
    description?: unknown;
    severity?: unknown;
    affectedServices?: unknown;
    startedAt?: unknown;
    sourceUrl?: unknown;
  } | null;
  if (
    !parsed ||
    typeof parsed.vendor !== "string" ||
    parsed.vendor.length === 0 ||
    typeof parsed.category !== "string" ||
    !OUTAGE_CATEGORIES.includes(parsed.category as OutageVendorCategory) ||
    typeof parsed.title !== "string" ||
    parsed.title.length === 0 ||
    typeof parsed.description !== "string" ||
    parsed.description.length === 0 ||
    typeof parsed.severity !== "string" ||
    !INSIGHT_SEVERITIES.includes(parsed.severity as InsightSeverity) ||
    typeof parsed.startedAt !== "string" ||
    parsed.startedAt.length === 0
  ) {
    return invalidRequest();
  }
  const affectedServices = Array.isArray(parsed.affectedServices) ? parsed.affectedServices.filter((s): s is string => typeof s === "string") : [];
  if (parsed.sourceUrl !== undefined && typeof parsed.sourceUrl !== "string") return invalidRequest();

  return toRouteResult(
    () =>
      reportOutage(apiClientConfig(sessionToken), {
        vendor: parsed.vendor as string,
        category: parsed.category as OutageVendorCategory,
        title: parsed.title as string,
        description: parsed.description as string,
        severity: parsed.severity as InsightSeverity,
        affectedServices,
        startedAt: parsed.startedAt as string,
        sourceUrl: parsed.sourceUrl as string | undefined,
      }),
    201,
  );
}

export async function handleResolveOutage(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => resolveOutage(apiClientConfig(sessionToken), id), 200);
}

export async function handleGenerateOutageNotices(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => generateOutageNotices(apiClientConfig(sessionToken), id), 201);
}
