import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../lib/session";
import { handleRemoveControlFromCustomerPolicy } from "../../../../../../../lib/routeHandlers/customerPolicies";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; controlKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { id, controlKey } = await params;
  const result = await handleRemoveControlFromCustomerPolicy(sessionToken, id, controlKey);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
