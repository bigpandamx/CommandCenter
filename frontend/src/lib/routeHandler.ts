/**
 * Shared plumbing for Route Handlers, extracted specifically to make
 * each route's actual logic testable without Next.js's runtime.
 *
 * next/headers's cookies() (used by getSessionToken in ./session) only
 * works inside Next's own request-scoped context (AsyncLocalStorage) --
 * calling a route's exported POST/GET function directly from a plain
 * node:test file isn't reliably possible, unlike Fastify's preHandlers
 * (plain functions callable with a mock request/reply). The fix isn't
 * to fake that context; it's to keep the exported POST/GET functions so
 * thin that faking it is unnecessary -- all they do is read the
 * session/params/body and hand off to a plain function that takes those
 * as arguments and returns a RouteResult, with zero dependency on
 * next/headers or next/server. That plain function is what actually
 * gets tested; the wrapper is small enough that `next build` (already
 * in CI) is adequate coverage for it.
 */
import { AdminApiError } from "./adminApiClient";

export interface RouteResult {
  status: number;
  body: unknown;
}

/**
 * Runs an adminApiClient call and shapes its result/error into a
 * RouteResult -- the one piece of logic every route repeated
 * identically (catch AdminApiError, map to {status, body}; anything
 * else rethrows, since a genuinely unexpected error should still crash
 * loudly rather than being silently absorbed into a 500 with no trace).
 */
export async function toRouteResult<T>(fn: () => Promise<T>, successStatus: number): Promise<RouteResult> {
  try {
    const result = await fn();
    return { status: successStatus, body: result };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { status: err.status, body: { error: err.message } };
    }
    throw err;
  }
}

export const notAuthenticated: RouteResult = { status: 401, body: { error: "not_authenticated" } };
export const invalidRequest = (details?: unknown): RouteResult => ({ status: 400, body: { error: "invalid_request", ...(details ? { details } : {}) } });
