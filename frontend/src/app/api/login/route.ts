import { NextRequest, NextResponse } from "next/server";
import { login, AdminApiError } from "../../../lib/adminApiClient";
import { apiClientConfig, SESSION_COOKIE_NAME } from "../../../lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await login(apiClientConfig(), body.email, body.password);

    const response = NextResponse.json({ staffUser: result.staffUser });
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(result.expiresAt),
    });
    return response;
  } catch (err) {
    if (err instanceof AdminApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
