import { z } from "zod";

import { hashPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { hashPasswordResetToken } from "@/lib/password-reset";

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success)
    return fail("VALIDATION_FAILED", "The password reset request is invalid.", 400);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(parsed.data.token) },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    return fail(
      "PASSWORD_RESET_TOKEN_INVALID",
      "This password reset link is invalid or expired.",
      400,
    );
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(parsed.data.password);
  } catch {
    return fail("WEAK_PASSWORD", "Password does not meet the strength policy.", 400);
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return ok({ passwordReset: true });
}
