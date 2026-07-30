import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../lib/session";
import { handleCancel } from "../../../../../../../lib/routeHandlers/serviceCatalog";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ organizationId: string; serviceKey: string }> },
) {
  const sessionToken = await getSessionToken();
  const { organizationId, serviceKey } = await params;
  const result = await handleCancel(sessionToken, organizationId, serviceKey);
  return NextResponse.json(result.body, { status: result.status });
}
