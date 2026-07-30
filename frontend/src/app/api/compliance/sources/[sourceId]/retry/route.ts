import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleRetrySource } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const sessionToken = await getSessionToken();
  const { sourceId } = await params;
  const result = await handleRetrySource(sessionToken, sourceId);
  return NextResponse.json(result.body, { status: result.status });
}
