import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../lib/session";
import { handleCreate } from "../../../lib/routeHandlers/tickets";

export async function POST(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => null);
  const result = await handleCreate(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
