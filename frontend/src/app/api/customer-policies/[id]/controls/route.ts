import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleAddControlToCustomerPolicy } from "../../../../../lib/routeHandlers/customerPolicies";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleAddControlToCustomerPolicy(sessionToken, id, body);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
