import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleSyncThreatActors } from "../../../../../lib/routeHandlers/threatIntel";

export async function POST() {
  const sessionToken = await getSessionToken();
  const result = await handleSyncThreatActors(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
