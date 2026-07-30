import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleGetActive } from "../../../../lib/routeHandlers/announcements";

export async function GET() {
  const sessionToken = await getSessionToken();
  const result = await handleGetActive(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
