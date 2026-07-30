import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleApproveApprovalRequest } from "../../../../../../lib/routeHandlers/governance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const sessionToken = await getSessionToken();
  const { requestId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleApproveApprovalRequest(sessionToken, requestId, body);
  return NextResponse.json(result.body, { status: result.status });
}
