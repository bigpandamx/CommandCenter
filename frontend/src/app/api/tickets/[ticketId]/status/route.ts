import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleChangeStatus } from "../../../../../lib/routeHandlers/tickets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { ticketId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleChangeStatus(sessionToken, ticketId, body);
  return NextResponse.json(result.body, { status: result.status });
}
