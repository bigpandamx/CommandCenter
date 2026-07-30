/**
 * Server-side session handling. The staff session token issued by
 * POST /v1/staff/login is stored in an httpOnly, Secure, SameSite=Lax
 * cookie set by our own Route Handler (app/api/login/route.ts) -- never
 * exposed to client-side JS. This is deliberately more work than just
 * storing the token in localStorage from a client component, but avoids
 * handing a valid session token to anything an XSS bug could reach.
 *
 * Route Handlers and Server Components read the cookie via next/headers
 * and use it to build an AdminApiClientConfig for calls to backend/api.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminApiClientConfig } from "./adminApiClient";
import { apiClientConfig } from "./apiClientConfig";

export { apiClientConfig } from "./apiClientConfig";

export const SESSION_COOKIE_NAME = "cc_session";

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** For use in Server Components: redirects to /login if there's no session, otherwise returns a ready-to-use API client config. */
export async function requireSession(): Promise<AdminApiClientConfig> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    redirect("/login");
  }
  return apiClientConfig(sessionToken ?? undefined);
}
