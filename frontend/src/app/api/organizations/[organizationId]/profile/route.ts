import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleUpdateProfile } from "../../../../../lib/routeHandlers/organizations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { organizationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleUpdateProfile(sessionToken, organizationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
