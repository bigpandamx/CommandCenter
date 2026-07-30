import {
  revokeEnrollmentToken,
  issueEnrollmentToken,
  updateOrganizationProfile,
  createOrganization,
  signUpOrganization,
  type UpdateProfileInput,
  type Organization,
  type SignupInput,
} from "../adminApiClient";
import { apiClientConfig } from "../apiClientConfig";
import { invalidRequest, notAuthenticated, toRouteResult, type RouteResult } from "../routeHandler";

export async function handleRevoke(sessionToken: string | null, token: string): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(async () => {
    await revokeEnrollmentToken(apiClientConfig(sessionToken), token);
    return null;
  }, 204);
}

export async function handleIssueToken(sessionToken: string | null, organizationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  const parsed = (body ?? {}) as { maxUses?: unknown; expiresInSeconds?: unknown };
  return toRouteResult(
    () =>
      issueEnrollmentToken(apiClientConfig(sessionToken), organizationId, {
        maxUses: typeof parsed.maxUses === "number" ? parsed.maxUses : undefined,
        expiresInSeconds: typeof parsed.expiresInSeconds === "number" ? parsed.expiresInSeconds : undefined,
      }),
    201,
  );
}

export async function handleUpdateProfile(sessionToken: string | null, organizationId: string, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;
  return toRouteResult(
    () => updateOrganizationProfile(apiClientConfig(sessionToken), organizationId, body as UpdateProfileInput),
    200,
  );
}

export async function handleCreate(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = body as { name?: unknown; entitlementTier?: unknown } | null;
  if (!parsed || typeof parsed.name !== "string" || typeof parsed.entitlementTier !== "string") {
    return invalidRequest();
  }

  return toRouteResult(
    () =>
      createOrganization(apiClientConfig(sessionToken), {
        name: parsed.name as string,
        entitlementTier: parsed.entitlementTier as Organization["entitlementTier"],
      }),
    201,
  );
}

export async function handleSignup(sessionToken: string | null, body: unknown): Promise<RouteResult> {
  if (!sessionToken) return notAuthenticated;

  const parsed = body as { organizationName?: unknown; primaryContactName?: unknown; primaryContactEmail?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.organizationName !== "string" ||
    typeof parsed.primaryContactName !== "string" ||
    typeof parsed.primaryContactEmail !== "string"
  ) {
    return invalidRequest();
  }

  return toRouteResult(() => signUpOrganization(apiClientConfig(sessionToken), parsed as unknown as SignupInput), 201);
}
