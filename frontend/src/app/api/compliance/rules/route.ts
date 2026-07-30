import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleCreateRule } from "../../../../lib/routeHandlers/compliance";

export async function POST(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => ({}));
  const result = await handleCreateRule(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
