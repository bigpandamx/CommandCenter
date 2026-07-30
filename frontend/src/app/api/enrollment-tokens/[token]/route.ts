import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/session";
import { handleRevoke } from "../../../../lib/routeHandlers/organizations";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const sessionToken = await getSessionToken();
  const { token } = await params;
  const result = await handleRevoke(sessionToken, token);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
