import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleAddComment } from "../../../../../lib/routeHandlers/tickets";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { ticketId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleAddComment(sessionToken, ticketId, body);
  return NextResponse.json(result.body, { status: result.status });
}
