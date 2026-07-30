import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleInterpret } from "../../../../../../lib/routeHandlers/compliance";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const result = await handleInterpret(sessionToken, key);
  return NextResponse.json(result.body, { status: result.status });
}
