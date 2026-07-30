/**
 * Extracted Route Handler logic for the Service Catalog proxy routes.
 * Zero dependency on next/headers or next/server -- see routeHandler.ts's
 * own doc comment for why that's the whole point of this split. The
 * route.ts files import these and wrap them in the thinnest possible
 * next/server-touching layer.
 */
import {
  attachOrganizationService,
  cancelOrganizationService,
  createCatalogService,
  editCatalogService,
  addCatalogServiceDependency,
  removeCatalogServiceDependency,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleAttach(
  sessionToken: string | null,
  organizationId: string,
  serviceKey: string,
  body: unknown,
): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { trial?: unknown; trialDurationDays?: unknown };
  return toRouteResult(
    () =>
      attachOrganizationService(apiClientConfig(sessionToken), organizationId, serviceKey, {
        trial: typeof parsed.trial === "boolean" ? parsed.trial : undefined,
        trialDurationDays: typeof parsed.trialDurationDays === "number" ? parsed.trialDurationDays : undefined,
      }),
    201,
  );
}

export async function handleCancel(sessionToken: string | null, organizationId: string, serviceKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(() => cancelOrganizationService(apiClientConfig(sessionToken), organizationId, serviceKey), 200);
}

export async function handleCreateService(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = (body ?? {}) as Record<string, unknown>;
  if (typeof parsed.key !== "string" || typeof parsed.name !== "string" || typeof parsed.description !== "string" || typeof parsed.category !== "string") {
    return invalidRequest();
  }

  return toRouteResult(
    () =>
      createCatalogService(apiClientConfig(sessionToken), {
        key: parsed.key as string,
        name: parsed.name as string,
        description: parsed.description as string,
        category: parsed.category as string,
        minimumPlanCode: typeof parsed.minimumPlanCode === "string" && parsed.minimumPlanCode.length > 0 ? parsed.minimumPlanCode : null,
        supportsTrial: typeof parsed.supportsTrial === "boolean" ? parsed.supportsTrial : undefined,
        monthlyPriceCents: typeof parsed.monthlyPriceCents === "number" ? parsed.monthlyPriceCents : null,
        usageMeterKey: typeof parsed.usageMeterKey === "string" && parsed.usageMeterKey.length > 0 ? parsed.usageMeterKey : null,
        entitlementKey: typeof parsed.entitlementKey === "string" && parsed.entitlementKey.length > 0 ? parsed.entitlementKey : null,
      }),
    201,
  );
}

/**
 * Every field is optional -- a field genuinely absent from the body
 * (not just empty-string) is left untouched, matching editService's
 * own "omitted means keep as-is" semantics. The form itself always
 * sends every field it controls (it's a full Save of the currently
 * displayed state), but the handler stays honest about the
 * distinction rather than assuming the caller always will.
 */
export async function handleEditService(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = (body ?? {}) as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  if (typeof parsed.name === "string") input.name = parsed.name;
  if (typeof parsed.description === "string") input.description = parsed.description;
  if (typeof parsed.category === "string") input.category = parsed.category;
  if (typeof parsed.isActive === "boolean") input.isActive = parsed.isActive;
  if (typeof parsed.supportsTrial === "boolean") input.supportsTrial = parsed.supportsTrial;
  if ("minimumPlanCode" in parsed) input.minimumPlanCode = typeof parsed.minimumPlanCode === "string" && parsed.minimumPlanCode.length > 0 ? parsed.minimumPlanCode : null;
  if ("monthlyPriceCents" in parsed) input.monthlyPriceCents = typeof parsed.monthlyPriceCents === "number" ? parsed.monthlyPriceCents : null;
  if ("usageMeterKey" in parsed) input.usageMeterKey = typeof parsed.usageMeterKey === "string" && parsed.usageMeterKey.length > 0 ? parsed.usageMeterKey : null;
  if ("entitlementKey" in parsed) input.entitlementKey = typeof parsed.entitlementKey === "string" && parsed.entitlementKey.length > 0 ? parsed.entitlementKey : null;

  return toRouteResult(() => editCatalogService(apiClientConfig(sessionToken), key, input), 200);
}

export async function handleAddDependency(sessionToken: string | null, key: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { dependsOnServiceKey?: unknown };
  if (typeof parsed.dependsOnServiceKey !== "string") {
    return invalidRequest();
  }
  return toRouteResult(async () => {
    await addCatalogServiceDependency(apiClientConfig(sessionToken), key, parsed.dependsOnServiceKey as string);
    return null;
  }, 204);
}

export async function handleRemoveDependency(sessionToken: string | null, key: string, dependsOnKey: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await removeCatalogServiceDependency(apiClientConfig(sessionToken), key, dependsOnKey);
    return null;
  }, 204);
}
