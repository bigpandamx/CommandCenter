import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleSchedule } from "../../../../../lib/routeHandlers/announcements";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  const sessionToken = await getSessionToken();
  const { announcementId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleSchedule(sessionToken, announcementId, body);
  return NextResponse.json(result.body, { status: result.status });
}
