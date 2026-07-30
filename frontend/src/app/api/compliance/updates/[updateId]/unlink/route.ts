import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleUnlinkUpdate } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ updateId: string }> }) {
  const sessionToken = await getSessionToken();
  const { updateId } = await params;
  const result = await handleUnlinkUpdate(sessionToken, updateId);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
