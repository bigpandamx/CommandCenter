import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleSyncVulnerabilities } from "../../../../../lib/routeHandlers/threatIntel";

export async function POST() {
  const sessionToken = await getSessionToken();
  const result = await handleSyncVulnerabilities(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
