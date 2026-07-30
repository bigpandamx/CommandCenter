import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleRunJobNow } from "../../../../../lib/routeHandlers/jobs";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const result = await handleRunJobNow(sessionToken, key);
  return NextResponse.json(result.body, { status: result.status });
}
