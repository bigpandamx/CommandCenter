import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleListTasks, handleSubmitTask } from "../../../../lib/routeHandlers/agents";

export async function GET(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const { searchParams } = new URL(request.url);
  const result = await handleListTasks(sessionToken, {
    capability: searchParams.get("capability"),
    status: searchParams.get("status"),
    limit: searchParams.get("limit"),
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const sessionToken = await getSessionToken();
  const body = await request.json().catch(() => null);
  const result = await handleSubmitTask(sessionToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
