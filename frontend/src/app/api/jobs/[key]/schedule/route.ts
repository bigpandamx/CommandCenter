import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleUpdateJobSchedule } from "../../../../../lib/routeHandlers/jobs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const sessionToken = await getSessionToken();
  const { key } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleUpdateJobSchedule(sessionToken, key, body);
  return NextResponse.json(result.body, { status: result.status });
}
