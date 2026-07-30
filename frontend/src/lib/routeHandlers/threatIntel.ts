/**
 * Extracted Route Handler logic for Threat Intelligence proxy routes.
 * Zero dependency on next/headers or next/server -- see
 * routeHandler.ts's own doc comment for why that's the whole point of
 * this split.
 */
import {
  syncVulnerabilitiesNow,
  createThreatPattern,
  verifyThreatPattern,
  markThreatPatternFalsePositive,
  setThreatPatternActive,
  generateThreatAdvisory,
  createStaffThreatActor,
  setThreatActorActive,
  syncThreatActorsNow,
  createIntelligenceReport,
  updateIntelligenceReport,
  publishIntelligenceReport,
  unpublishIntelligenceReport,
  createStaffCampaign,
  setCampaignActive,
  syncCampaignsNow,
  setTechniqueActive,
  syncTechniquesNow,
  createStaffMalware,
  setMalwareActive,
  syncMalwareNow,
  setThreatActorGeography,
  setCampaignGeography,
  getGeographicFootprint,
  getGeographicThreatMatches,
  createIoc,
  updateIoc,
  setIocActive,
  type CreateThreatPatternInput,
  type CreateStaffThreatActorInput,
  type CreateIntelligenceReportInput,
  type UpdateIntelligenceReportInput,
  type CreateStaffCampaignInput,
  type CreateStaffMalwareInput,
  type SetGeographyInput,
  type CreateIocInput,
  type UpdateIocInput,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleSyncVulnerabilities(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => syncVulnerabilitiesNow(apiClientConfig(sessionToken)), 200);
}

export async function handleCreateThreatPattern(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateThreatPatternInput> | null;
  if (
    !parsed ||
    typeof parsed.patternId !== "string" ||
    typeof parsed.patternName !== "string" ||
    typeof parsed.threatType !== "string" ||
    typeof parsed.severity !== "string" ||
    typeof parsed.description !== "string" ||
    typeof parsed.attackVector !== "string" ||
    typeof parsed.avgSeverityScore !== "number" ||
    !parsed.detectionSignature
  ) {
    return invalidRequest();
  }
  return toRouteResult(() => createThreatPattern(apiClientConfig(sessionToken), parsed as CreateThreatPatternInput), 201);
}

export async function handleVerifyThreatPattern(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => verifyThreatPattern(apiClientConfig(sessionToken), id), 200);
}

export async function handleMarkThreatPatternFalsePositive(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => markThreatPatternFalsePositive(apiClientConfig(sessionToken), id), 200);
}

export async function handleSetThreatPatternActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setThreatPatternActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}

export async function handleGenerateThreatAdvisory(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => generateThreatAdvisory(apiClientConfig(sessionToken), id), 201);
}

export async function handleCreateStaffThreatActor(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateStaffThreatActorInput> | null;
  if (!parsed || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => createStaffThreatActor(apiClientConfig(sessionToken), parsed as CreateStaffThreatActorInput), 201);
}

export async function handleSetThreatActorActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setThreatActorActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}

export async function handleSyncThreatActors(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => syncThreatActorsNow(apiClientConfig(sessionToken)), 200);
}

export async function handleCreateIntelligenceReport(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateIntelligenceReportInput> | null;
  if (!parsed || typeof parsed.title !== "string" || typeof parsed.summary !== "string" || typeof parsed.body !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => createIntelligenceReport(apiClientConfig(sessionToken), parsed as CreateIntelligenceReportInput), 201);
}

export async function handleUpdateIntelligenceReport(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as UpdateIntelligenceReportInput;
  return toRouteResult(() => updateIntelligenceReport(apiClientConfig(sessionToken), id, parsed), 200);
}

export async function handlePublishIntelligenceReport(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => publishIntelligenceReport(apiClientConfig(sessionToken), id), 200);
}

export async function handleUnpublishIntelligenceReport(sessionToken: string | null, id: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => unpublishIntelligenceReport(apiClientConfig(sessionToken), id), 200);
}

export async function handleCreateStaffCampaign(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateStaffCampaignInput> | null;
  if (!parsed || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => createStaffCampaign(apiClientConfig(sessionToken), parsed as CreateStaffCampaignInput), 201);
}

export async function handleSetCampaignActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setCampaignActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}

export async function handleSyncCampaigns(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => syncCampaignsNow(apiClientConfig(sessionToken)), 200);
}

export async function handleSetTechniqueActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setTechniqueActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}

export async function handleSyncTechniques(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => syncTechniquesNow(apiClientConfig(sessionToken)), 200);
}

export async function handleCreateStaffMalware(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateStaffMalwareInput> | null;
  if (
    !parsed ||
    typeof parsed.name !== "string" ||
    typeof parsed.description !== "string" ||
    (parsed.softwareType !== "malware" && parsed.softwareType !== "tool")
  ) {
    return invalidRequest();
  }
  return toRouteResult(() => createStaffMalware(apiClientConfig(sessionToken), parsed as CreateStaffMalwareInput), 201);
}

export async function handleSetMalwareActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setMalwareActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}

export async function handleSyncMalware(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => syncMalwareNow(apiClientConfig(sessionToken)), 200);
}

function parseGeographyBody(body: unknown): SetGeographyInput | null {
  const parsed = body as { originCountry?: unknown; targetedCountries?: unknown } | null;
  if (!parsed) return null;
  if (parsed.originCountry !== undefined && parsed.originCountry !== null && typeof parsed.originCountry !== "string") return null;
  if (parsed.targetedCountries !== undefined && !Array.isArray(parsed.targetedCountries)) return null;
  return parsed as SetGeographyInput;
}

export async function handleSetThreatActorGeography(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = parseGeographyBody(body);
  if (!parsed) return invalidRequest();
  return toRouteResult(() => setThreatActorGeography(apiClientConfig(sessionToken), id, parsed), 200);
}

export async function handleSetCampaignGeography(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = parseGeographyBody(body);
  if (!parsed) return invalidRequest();
  return toRouteResult(() => setCampaignGeography(apiClientConfig(sessionToken), id, parsed), 200);
}

export async function handleGetGeographicFootprint(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => getGeographicFootprint(apiClientConfig(sessionToken)), 200);
}

export async function handleGetGeographicThreatMatches(sessionToken: string | null): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => getGeographicThreatMatches(apiClientConfig(sessionToken)), 200);
}

export async function handleCreateIoc(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as Partial<CreateIocInput> | null;
  if (!parsed || typeof parsed.iocType !== "string" || typeof parsed.value !== "string") {
    return invalidRequest();
  }
  return toRouteResult(() => createIoc(apiClientConfig(sessionToken), parsed as CreateIocInput), 201);
}

export async function handleUpdateIoc(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as UpdateIocInput;
  return toRouteResult(() => updateIoc(apiClientConfig(sessionToken), id, parsed), 200);
}

export async function handleSetIocActive(sessionToken: string | null, id: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { isActive?: unknown } | null;
  if (!parsed || typeof parsed.isActive !== "boolean") {
    return invalidRequest();
  }
  return toRouteResult(() => setIocActive(apiClientConfig(sessionToken), id, parsed.isActive as boolean), 200);
}
