import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleSignup } from "../../../../lib/routeHandlers/organizations";

export async function POST(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => null);
  const result = await handleSignup(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
