import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleDeactivateSource } from "../../../../../lib/routeHandlers/compliance";

export async function DELETE(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const sessionToken = await getSessionToken();
  const { sourceId } = await params;
  const result = await handleDeactivateSource(sessionToken, sourceId);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
