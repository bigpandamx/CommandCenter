import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleAcknowledge } from "../../../../../lib/routeHandlers/announcements";

export async function POST(_request: Request, { params }: { params: Promise<{ announcementId: string }> }) {
  const sessionToken = await getSessionToken();
  const { announcementId } = await params;
  const result = await handleAcknowledge(sessionToken, announcementId);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
