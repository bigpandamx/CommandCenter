import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleUpdate } from "../../../../lib/routeHandlers/announcements";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { announcementId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleUpdate(sessionToken, announcementId, body);
  return NextResponse.json(result.body, { status: result.status });
}
