import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../../../lib/session";
import { handleRemoveControlFromFramework } from "../../../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string; controlKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { key, controlKey } = await params;
  const result = await handleRemoveControlFromFramework(sessionToken, key, controlKey);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
