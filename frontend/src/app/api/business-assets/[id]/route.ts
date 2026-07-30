import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleUpdateBusinessAsset } from "../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = await handleUpdateBusinessAsset(sessionToken, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
