import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../../lib/session";
import { handleRemoveDependency } from "../../../../../../lib/routeHandlers/serviceCatalog";

export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string; dependsOnKey: string }> }) {
  const sessionToken = await getSessionToken();
  const { key, dependsOnKey } = await params;
  const result = await handleRemoveDependency(sessionToken, key, dependsOnKey);
  return new NextResponse(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status });
}
