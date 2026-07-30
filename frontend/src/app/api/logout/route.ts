import { NextResponse } from "next/server";
import { logout } from "../../../lib/adminApiClient";
import { apiClientConfig, getSessionToken, SESSION_COOKIE_NAME } from "../../../lib/session";

export async function POST() {
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    // Best-effort revoke -- even if backend/api is unreachable, we still want
    // to clear the local cookie so the user is signed out client-side.
    await logout(apiClientConfig(sessionToken)).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
