import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../../lib/session";
import { handleRemoveRelated } from "../../../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string; relatedRuleKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { key, relatedRuleKey } = await params;
  const result = await handleRemoveRelated(sessionToken, key, relatedRuleKey);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
