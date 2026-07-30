import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleCreateBusinessAsset } from "../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { organizationId } = await params;
  const body = await request.json().catch(() => null);
  const result = await handleCreateBusinessAsset(sessionToken, organizationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
