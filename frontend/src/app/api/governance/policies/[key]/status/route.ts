import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleSetPolicyStatus } from "../../../../../../lib/routeHandlers/governance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleSetPolicyStatus(sessionToken, key, body);
  return NextResponse.json(result.body, { status: result.status });
}
