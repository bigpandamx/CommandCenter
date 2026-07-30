import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleProcess } from "../../../../lib/routeHandlers/agents";

export async function POST() {
  const sessionToken = await getSessionToken();
  const result = await handleProcess(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
