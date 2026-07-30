import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleSetIocActive } from "../../../../../../lib/routeHandlers/threatIntel";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = await getSessionToken();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleSetIocActive(sessionToken, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
