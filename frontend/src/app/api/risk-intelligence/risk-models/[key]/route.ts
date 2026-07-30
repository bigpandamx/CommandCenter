import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleUpdateRiskModel } from "../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const body = await request.json().catch(() => null);
  const result = await handleUpdateRiskModel(sessionToken, key, body);
  return NextResponse.json(result.body, { status: result.status });
}
