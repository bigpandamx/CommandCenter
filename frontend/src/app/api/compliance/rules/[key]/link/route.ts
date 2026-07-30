import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleLinkUpdate } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleLinkUpdate(sessionToken, key, body);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
