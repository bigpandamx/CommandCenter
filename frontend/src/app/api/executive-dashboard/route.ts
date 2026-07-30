import { NextResponse } from "next/server";
import { getSessionToken } from "../../../lib/session";
import { handleGetExecutiveDashboard } from "../../../lib/routeHandlers/executiveDashboard";

export async function GET() {
  const sessionToken = await getSessionToken();
  const result = await handleGetExecutiveDashboard(sessionToken);
  return NextResponse.json(result.body, { status: result.status });
}
