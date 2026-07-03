import { randomUUID, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api";
import { sanitizeNextPath, SESSION_COOKIE_NAME } from "@/lib/auth-session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_FAILED", "Enter a valid email and password.");

  const demoEmail = process.env.DEMO_LOGIN_EMAIL ?? "demo@slide-agent.local";
  const demoPassword = process.env.DEMO_LOGIN_PASSWORD ?? "DemoPassword!123";
  if (!safeEqual(parsed.data.email, demoEmail) || !safeEqual(parsed.data.password, demoPassword)) {
    return fail("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  }

  const redirectTo = sanitizeNextPath(parsed.data.next);
  const response = NextResponse.json({ ok: true, data: { redirectTo } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: randomUUID(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
