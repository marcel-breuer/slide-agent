import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { logSafe } from "@/lib/safe-logger";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TTL_MS,
  sendPasswordResetEmail,
} from "@/lib/password-reset";
const ForgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Enter a valid email address.", 400);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true },
  });

  // Keep the response identical for existing and unknown accounts.
  if (!user) return ok({ accepted: true });

  const token = createPasswordResetToken();
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: {
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      tokenHash: hashPasswordResetToken(token),
      userId: user.id,
    },
  });

  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, origin).toString();
  try {
    await sendPasswordResetEmail({ recipient: user.email, resetUrl });
  } catch (error) {
    logSafe("error", "password reset email delivery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return ok({ accepted: true });
}
