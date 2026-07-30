import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleMapControl } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ obligationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { obligationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleMapControl(sessionToken, obligationId, body);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
