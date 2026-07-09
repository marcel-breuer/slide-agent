import { getAuthenticatedSession } from "./server-auth-session";

export async function getAuthenticatedUserId(): Promise<string | null> {
  return (await getAuthenticatedSession())?.userId ?? null;
}
