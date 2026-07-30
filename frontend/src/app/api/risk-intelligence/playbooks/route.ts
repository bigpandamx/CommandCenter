import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleCreatePlaybook } from "../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => null);
  const result = await handleCreatePlaybook(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
