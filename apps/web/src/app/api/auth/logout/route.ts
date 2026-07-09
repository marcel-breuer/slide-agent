import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { readSessionTokenFromCookie, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { revokeSessionToken } from "@/lib/server-auth-session";

export async function POST() {
  const cookieStore = await cookies();
  const token = await readSessionTokenFromCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  await revokeSessionToken(token ?? undefined);

  const response = NextResponse.json({ ok: true, data: { signedOut: true } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
