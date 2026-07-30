import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleMarkPendingReview } from "../../../../../../lib/routeHandlers/complianceQueue";

export async function POST(_request: Request, { params }: { params: Promise<{ updateId: string }> }) {
  const sessionToken = await getSessionToken();
  const { updateId } = await params;
  const result = await handleMarkPendingReview(sessionToken, updateId);
  return NextResponse.json(result.body, { status: result.status });
}
