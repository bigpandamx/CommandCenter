import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleSubmitCustomerPolicy } from "../../../../../lib/routeHandlers/customerPolicies";

export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { organizationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleSubmitCustomerPolicy(sessionToken, organizationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
