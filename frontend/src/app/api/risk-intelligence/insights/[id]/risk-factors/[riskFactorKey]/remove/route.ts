import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../lib/session";
import { handleDeclassifyInsight } from "../../../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; riskFactorKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { id, riskFactorKey } = await params;
  const result = await handleDeclassifyInsight(sessionToken, id, riskFactorKey);
  return NextResponse.json(result.body, { status: result.status });
}
