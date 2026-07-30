import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handlePublishIntelligenceReport } from "../../../../../../lib/routeHandlers/threatIntel";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const result = await handlePublishIntelligenceReport(sessionToken, id);
  return NextResponse.json(result.body, { status: result.status });
}
