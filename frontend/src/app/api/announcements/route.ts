import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../lib/session";
import { handleSearch, handleCreate } from "../../../lib/routeHandlers/announcements";

export async function GET(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const { searchParams } = new URL(request.url);
  const result = await handleSearch(sessionToken, {
    status: searchParams.get("status"),
    audience: searchParams.get("audience"),
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => null);
  const result = await handleCreate(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
