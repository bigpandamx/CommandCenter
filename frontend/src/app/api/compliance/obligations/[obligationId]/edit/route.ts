import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleEdit } from "../../../../../../lib/routeHandlers/obligationReview";

export async function POST(request: NextRequest, { params }: { params: Promise<{ obligationId: string }> }) {
  const sessionToken = await getSessionToken();
  const { obligationId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await handleEdit(sessionToken, obligationId, body);
  return NextResponse.json(result.body, { status: result.status });
}
