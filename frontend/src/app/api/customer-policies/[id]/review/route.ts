import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleReviewCustomerPolicy } from "../../../../../lib/routeHandlers/customerPolicies";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleReviewCustomerPolicy(sessionToken, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
