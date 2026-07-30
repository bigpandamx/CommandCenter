import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleReset } from "../../../../../../lib/routeHandlers/obligationReview";

export async function POST(_request: Request, { params }: { params: Promise<{ obligationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { obligationId } = await params;
  const result = await handleReset(sessionToken, obligationId);
  return NextResponse.json(result.body, { status: result.status });
}
