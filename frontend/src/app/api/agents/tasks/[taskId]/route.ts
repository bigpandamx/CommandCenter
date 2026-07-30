import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleGetTask } from "../../../../../lib/routeHandlers/agents";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const sessionToken = await getSessionToken();
  const { taskId } = await params;
  const result = await handleGetTask(sessionToken, taskId);
  return NextResponse.json(result.body, { status: result.status });
}
