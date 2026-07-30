/**
 * Extracted Route Handler logic for Compliance/Impact Assessment/Rules
 * proxy routes. Zero dependency on next/headers or next/server -- see
 * routeHandler.ts's own doc comment for why that's the whole point of
 * this split.
 */
import {
  distributeObligationImpact,
  createComplianceRule,
  linkUpdateToRule,
  unlinkUpdateFromRule,
  addRelatedRule,
  removeRelatedRule,
  interpretRule,
  createComplianceControl,
  mapObligationToControl,
  unmapObligationFromControl,
  matchObligationToControls,
  createCompliancePack,
  addControlToPack,
  removeControlFromPack,
  createComplianceFramework,
  addControlToFramework,
  removeControlFromFramework,
  createComplianceSource,
  deactivateComplianceSource,
  activateComplianceSource,
  retryComplianceSource,
  updateComplianceSourceSchedule,
  addManualComplianceUpdate,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleDistribute(sessionToken: string | null, obligationId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => distributeObligationImpact(apiClientConfig(sessionToken), obligationId), 201);
}

export async function handleCreateRule(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  return toRouteResult(
    () => createComplianceRule(apiClientConfig(sessionToken), { key: parsed.key as string, name: parsed.name as string, description: parsed.description as string }),
    201,
  );
}

export async function handleLinkUpdate(sessionToken: string | null, ruleKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { updateId?: unknown } | null;
  if (!parsed || typeof parsed.updateId !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await linkUpdateToRule(apiClientConfig(sessionToken), ruleKey, parsed.updateId as string);
    return null;
  }, 204);
}

export async function handleUnlinkUpdate(sessionToken: string | null, updateId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await unlinkUpdateFromRule(apiClientConfig(sessionToken), updateId);
    return null;
  }, 204);
}

export async function handleAddRelated(sessionToken: string | null, ruleKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { relatedRuleKey?: unknown } | null;
  if (!parsed || typeof parsed.relatedRuleKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addRelatedRule(apiClientConfig(sessionToken), ruleKey, parsed.relatedRuleKey as string);
    return null;
  }, 204);
}

export async function handleRemoveRelated(sessionToken: string | null, ruleKey: string, relatedRuleKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeRelatedRule(apiClientConfig(sessionToken), ruleKey, relatedRuleKey);
    return null;
  }, 204);
}

export async function handleInterpret(sessionToken: string | null, ruleKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => interpretRule(apiClientConfig(sessionToken), ruleKey), 201);
}

export async function handleCreateControl(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; code?: unknown; name?: unknown; description?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.key !== "string" ||
    typeof parsed.code !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.description !== "string"
  ) {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      createComplianceControl(apiClientConfig(sessionToken), {
        key: parsed.key as string,
        code: parsed.code as string,
        name: parsed.name as string,
        description: parsed.description as string,
      }),
    201,
  );
}

export async function handleMapControl(sessionToken: string | null, obligationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { controlKey?: unknown } | null;
  if (!parsed || typeof parsed.controlKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await mapObligationToControl(apiClientConfig(sessionToken), obligationId, parsed.controlKey as string);
    return null;
  }, 204);
}

export async function handleUnmapControl(sessionToken: string | null, obligationId: string, controlKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await unmapObligationFromControl(apiClientConfig(sessionToken), obligationId, controlKey);
    return null;
  }, 204);
}

export async function handleMatchControls(sessionToken: string | null, obligationId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => matchObligationToControls(apiClientConfig(sessionToken), obligationId), 201);
}

export async function handleCreatePack(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown; requiredProductKeys?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  const requiredProductKeys =
    Array.isArray(parsed.requiredProductKeys) && parsed.requiredProductKeys.every((k) => typeof k === "string")
      ? (parsed.requiredProductKeys as string[])
      : undefined;
  return toRouteResult(
    () =>
      createCompliancePack(apiClientConfig(sessionToken), {
        key: parsed.key as string,
        name: parsed.name as string,
        description: parsed.description as string,
        requiredProductKeys,
      }),
    201,
  );
}

export async function handleAddControlToPack(sessionToken: string | null, packKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { controlKey?: unknown } | null;
  if (!parsed || typeof parsed.controlKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addControlToPack(apiClientConfig(sessionToken), packKey, parsed.controlKey as string);
    return null;
  }, 204);
}

export async function handleRemoveControlFromPack(sessionToken: string | null, packKey: string, controlKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeControlFromPack(apiClientConfig(sessionToken), packKey, controlKey);
    return null;
  }, 204);
}

export async function handleCreateFramework(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { key?: unknown; name?: unknown; description?: unknown } | null;
  if (!parsed || typeof parsed.key !== "string" || typeof parsed.name !== "string" || typeof parsed.description !== "string") {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      createComplianceFramework(apiClientConfig(sessionToken), {
        key: parsed.key as string,
        name: parsed.name as string,
        description: parsed.description as string,
      }),
    201,
  );
}

export async function handleAddControlToFramework(sessionToken: string | null, frameworkKey: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { controlKey?: unknown } | null;
  if (!parsed || typeof parsed.controlKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addControlToFramework(apiClientConfig(sessionToken), frameworkKey, parsed.controlKey as string);
    return null;
  }, 204);
}

export async function handleRemoveControlFromFramework(sessionToken: string | null, frameworkKey: string, controlKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeControlFromFramework(apiClientConfig(sessionToken), frameworkKey, controlKey);
    return null;
  }, 204);
}

export async function handleCreateSource(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as
    | { name?: unknown; jurisdiction?: unknown; frameworkTags?: unknown; sourceType?: unknown; url?: unknown; scheduleIntervalMinutes?: unknown }
    | null;
  if (
    !parsed ||
    typeof parsed.name !== "string" ||
    typeof parsed.jurisdiction !== "string" ||
    !Array.isArray(parsed.frameworkTags) ||
    typeof parsed.sourceType !== "string" ||
    typeof parsed.url !== "string"
  ) {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      createComplianceSource(apiClientConfig(sessionToken), {
        name: parsed.name as string,
        jurisdiction: parsed.jurisdiction as string,
        frameworkTags: parsed.frameworkTags as string[],
        sourceType: parsed.sourceType as "rss" | "atom" | "json_api" | "manual",
        url: parsed.url as string,
        scheduleIntervalMinutes: typeof parsed.scheduleIntervalMinutes === "number" ? parsed.scheduleIntervalMinutes : undefined,
      }),
    201,
  );
}

export async function handleDeactivateSource(sessionToken: string | null, sourceId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await deactivateComplianceSource(apiClientConfig(sessionToken), sourceId);
    return null;
  }, 204);
}

export async function handleActivateSource(sessionToken: string | null, sourceId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await activateComplianceSource(apiClientConfig(sessionToken), sourceId);
    return null;
  }, 204);
}

export async function handleRetrySource(sessionToken: string | null, sourceId: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => retryComplianceSource(apiClientConfig(sessionToken), sourceId), 200);
}

export async function handleUpdateSourceSchedule(sessionToken: string | null, sourceId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { scheduleIntervalMinutes?: unknown } | null;
  const scheduleIntervalMinutes =
    parsed && (parsed.scheduleIntervalMinutes === null || typeof parsed.scheduleIntervalMinutes === "number")
      ? parsed.scheduleIntervalMinutes
      : undefined;
  if (scheduleIntervalMinutes === undefined) {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await updateComplianceSourceSchedule(apiClientConfig(sessionToken), sourceId, scheduleIntervalMinutes);
    return null;
  }, 204);
}

export async function handleAddManualUpdate(sessionToken: string | null, sourceId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = body as { externalId?: unknown; title?: unknown; summary?: unknown; url?: unknown } | null;
  if (!parsed || typeof parsed.externalId !== "string" || typeof parsed.title !== "string" || typeof parsed.summary !== "string" || typeof parsed.url !== "string") {
    return invalidRequest();
  }
  return toRouteResult(
    () =>
      addManualComplianceUpdate(apiClientConfig(sessionToken), sourceId, {
        externalId: parsed.externalId as string,
        title: parsed.title as string,
        summary: parsed.summary as string,
        url: parsed.url as string,
      }),
    201,
  );
}
