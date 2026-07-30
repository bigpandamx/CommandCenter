import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../../lib/session";
import { handleUnmapControl } from "../../../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ obligationId: string; controlKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { obligationId, controlKey } = await params;
  const result = await handleUnmapControl(sessionToken, obligationId, controlKey);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
