import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../../lib/session";
import { handleGetGeographicFootprint } from "../../../../../lib/routeHandlers/threatIntel";

export async function GET() {
  const sessionToken = await getSessionToken();
  const result = await handleGetGeographicFootprint(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
