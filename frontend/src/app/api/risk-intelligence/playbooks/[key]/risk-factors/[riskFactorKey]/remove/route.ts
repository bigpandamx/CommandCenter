import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../lib/session";
import { handleUnlinkPlaybookFromRiskFactor } from "../../../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string; riskFactorKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { key, riskFactorKey } = await params;
  const result = await handleUnlinkPlaybookFromRiskFactor(sessionToken, key, riskFactorKey);
  return NextResponse.json(result.body, { status: result.status });
}
