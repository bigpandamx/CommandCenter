import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleMarkAsDuplicate } from "../../../../../../lib/routeHandlers/complianceQueue";

export async function POST(_request: Request, { params }: { params: Promise<{ updateId: string }> }) {
  const sessionToken = await getSessionToken();
  const { updateId } = await params;
  const result = await handleMarkAsDuplicate(sessionToken, updateId);
  return NextResponse.json(result.body, { status: result.status });
}
