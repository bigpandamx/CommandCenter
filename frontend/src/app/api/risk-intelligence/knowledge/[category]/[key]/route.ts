import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleUpdateRiskKnowledgeEntry } from "../../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request, { params }: { params: Promise<{ category: string; key: string }> }) {
  const sessionToken = await getSessionToken();
  const { category, key } = await params;
  const body = await request.json().catch(() => null);
  const result = await handleUpdateRiskKnowledgeEntry(sessionToken, category, key, body);
  return NextResponse.json(result.body, { status: result.status });
}
