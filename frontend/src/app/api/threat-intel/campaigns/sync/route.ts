import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleSyncCampaigns } from "../../../../../lib/routeHandlers/threatIntel";

export async function POST() {
  const sessionToken = await getSessionToken();
  const result = await handleSyncCampaigns(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
