import { cookies } from "next/headers";

import { DEMO_USER_ID } from "@slide-agent/database";

import { SESSION_COOKIE_NAME } from "./auth-session";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ? DEMO_USER_ID : null;
}
