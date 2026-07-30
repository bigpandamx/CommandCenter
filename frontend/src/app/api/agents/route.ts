import { NextResponse } from "next/server";
import { getSessionToken } from "../../../lib/session";
import { handleListAgents } from "../../../lib/routeHandlers/agents";

export async function GET() {
  const sessionToken = await getSessionToken();
  const result = await handleListAgents(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
