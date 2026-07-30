import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleAddManualUpdate } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const sessionToken = await getSessionToken();
  const { sourceId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleAddManualUpdate(sessionToken, sourceId, body);
  return NextResponse.json(result.body, { status: result.status });
}
