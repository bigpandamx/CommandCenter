import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../lib/session";
import { handleAttach } from "../../../../../../../lib/routeHandlers/serviceCatalog";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string; serviceKey: string }> },
) {
  const sessionToken = await getSessionToken();
  const { organizationId, serviceKey } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await handleAttach(sessionToken, organizationId, serviceKey, body);
  return NextResponse.json(result.body, { status: result.status });
}
