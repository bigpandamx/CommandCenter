import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleIssueToken } from "../../../../../lib/routeHandlers/organizations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { organizationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleIssueToken(sessionToken, organizationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
