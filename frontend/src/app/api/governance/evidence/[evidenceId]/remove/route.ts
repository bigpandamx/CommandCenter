import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleRemoveEvidence } from "../../../../../../lib/routeHandlers/governance";

export async function POST(_request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const sessionToken = await getSessionToken();
  const { evidenceId } = await params;
  const result = await handleRemoveEvidence(sessionToken, evidenceId);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
