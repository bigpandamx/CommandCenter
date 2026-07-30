import { redirect } from "next/navigation";
import { getSessionToken } from "../lib/session";

export default async function RootPage() {
  const sessionToken = await getSessionToken();
  redirect(sessionToken ? "/organizations" : "/login");
}
