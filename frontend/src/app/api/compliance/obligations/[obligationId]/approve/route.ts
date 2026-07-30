import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleApprove } from "../../../../../../lib/routeHandlers/obligationReview";

export async function POST(_request: Request, { params }: { params: Promise<{ obligationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { obligationId } = await params;
  const result = await handleApprove(sessionToken, obligationId);
  return NextResponse.json(result.body, { status: result.status });
}
