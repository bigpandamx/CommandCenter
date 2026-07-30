import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleCreateRiskKnowledgeEntry } from "../../../../../lib/routeHandlers/riskIntelligence";

export async function POST(request: Request, { params }: { params: Promise<{ category: string }> }) {
  const sessionToken = await getSessionToken();
  const { category } = await params;
  const body = await request.json().catch(() => null);
  const result = await handleCreateRiskKnowledgeEntry(sessionToken, category, body);
  return NextResponse.json(result.body, { status: result.status });
}
