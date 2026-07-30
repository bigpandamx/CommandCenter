import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleResolveViolation } from "../../../../../../lib/routeHandlers/governance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ violationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { violationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleResolveViolation(sessionToken, violationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
