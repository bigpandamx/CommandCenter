import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleTriggerRiskAssessment } from "../../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(_request: Request, { params }: { params: Promise<{ industry: string }> }) {
  const sessionToken = await getSessionToken();
  const { industry } = await params;
  const result = await handleTriggerRiskAssessment(sessionToken, industry);
  return NextResponse.json(result.body, { status: result.status });
}
