import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleUpdateSourceSchedule } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const sessionToken = await getSessionToken();
  const { sourceId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleUpdateSourceSchedule(sessionToken, sourceId, body);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
