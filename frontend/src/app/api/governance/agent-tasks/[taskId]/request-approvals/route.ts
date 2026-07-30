import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleRequestApprovalsFromTask } from "../../../../../../lib/routeHandlers/governance";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const sessionToken = await getSessionToken();
  const { taskId } = await params;
  const result = await handleRequestApprovalsFromTask(sessionToken, taskId);
  return NextResponse.json(result.body, { status: result.status });
}
