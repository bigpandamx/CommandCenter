import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handlePublish } from "../../../../../lib/routeHandlers/announcements";

export async function POST(_request: Request, { params }: { params: Promise<{ announcementId: string }> }) {
  const sessionToken = await getSessionToken();
  const { announcementId } = await params;
  const result = await handlePublish(sessionToken, announcementId);
  return NextResponse.json(result.body, { status: result.status });
}
