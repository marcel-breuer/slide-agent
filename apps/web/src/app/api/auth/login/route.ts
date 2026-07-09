import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail } from "@/lib/api";
import {
  createSessionCookieValue,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-session";
import { createUserSession } from "@/lib/server-auth-session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Enter a valid email and password.");

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      deletedAt: true,
      id: true,
      passwordHash: true,
      suspendedAt: true,
    },
  });

  const validPassword = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;
  if (!user || user.deletedAt || user.suspendedAt || !validPassword) {
    return fail("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  }

  const redirectTo = sanitizeNextPath(parsed.data.next);
  const session = await createUserSession(user.id);
  const cookieValue = await createSessionCookieValue(session.token, {
    expiresAt: session.expiresAt,
  });
  const response = NextResponse.json({ ok: true, data: { redirectTo } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
