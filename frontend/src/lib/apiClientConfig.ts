/**
 * Pure piece of session.ts, split out on purpose: apiClientConfig
 * itself never needs next/headers or next/navigation, but it used to
 * live in the same file as getSessionToken/requireSession, which do --
 * meaning anything that only wanted apiClientConfig still transitively
 * pulled in next/headers at module-load time. That's fine for real
 * Route Handlers (they run inside Next's runtime anyway), but it means
 * a plain node:test file can't import apiClientConfig standalone
 * without Next.js's real packages installed. The extracted Route
 * Handler logic in src/lib/routeHandlers/ needs exactly that: import
 * apiClientConfig, never touch next/headers at all, so it's testable
 * with tsx --test the same way any other pure lib code is.
 *
 * session.ts re-exports apiClientConfig from here so existing callers
 * importing it from "./session" keep working unchanged.
 */
import type { AdminApiClientConfig } from "./adminApiClient";

export const ADMIN_API_BASE_URL = process.env.ADMIN_API_BASE_URL;
if (!ADMIN_API_BASE_URL) {
  // Same "fail loud, not silently wrong" convention as backend/api's own
  // DATABASE_URL check -- an admin console silently pointed at the wrong
  // API is worse than one that won't start.
  throw new Error("ADMIN_API_BASE_URL must be set");
}

/** For Route Handlers that don't need a session yet (login) or handle its absence themselves. */
export function apiClientConfig(sessionToken?: string): AdminApiClientConfig {
  return { baseUrl: ADMIN_API_BASE_URL as string, sessionToken };
}
