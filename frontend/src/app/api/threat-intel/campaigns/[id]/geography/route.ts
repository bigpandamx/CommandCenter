import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleSetCampaignGeography } from "../../../../../../lib/routeHandlers/threatIntel";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleSetCampaignGeography(sessionToken, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
