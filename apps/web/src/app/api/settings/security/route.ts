import { hashPassword, verifyPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedSession } from "@/lib/server-auth-session";
import { z } from "zod";

const PasswordChangeSchema = z.object({
  confirmation: z.literal("CHANGE_PASSWORD"),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const [sessions, auditLogs] = await Promise.all([
    prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        rotatedAt: true,
      },
      where: { userId: session.userId },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        createdAt: true,
        id: true,
        metadata: true,
      },
      take: 20,
      where: { userId: session.userId },
    }),
  ]);

  return ok({
    auditEvents: auditLogs.map((event) => ({
      action: event.action,
      createdAt: event.createdAt.toISOString(),
      id: event.id,
      metadata: event.metadata,
    })),
    currentSessionId: session.sessionId,
    sessions: sessions.map((userSession) => ({
      createdAt: userSession.createdAt.toISOString(),
      current: userSession.id === session.sessionId,
      expiresAt: userSession.expiresAt.toISOString(),
      id: userSession.id,
      rotatedAt: userSession.rotatedAt?.toISOString() ?? null,
    })),
  });
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PasswordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "VALIDATION_FAILED",
      "Current password, a strong new password, and confirmation are required.",
      400,
    );
  }

  const user = await prisma.user.findUnique({
    select: { passwordHash: true },
    where: { id: session.userId },
  });
  if (!user) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const currentPasswordMatches = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!currentPasswordMatches) {
    return fail("INVALID_PASSWORD", "Current password is incorrect.", 400);
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(parsed.data.newPassword);
  } catch {
    return fail("VALIDATION_FAILED", "New password does not meet the strength policy.", 400);
  }

  await prisma.$transaction([
    prisma.user.update({
      data: { passwordHash },
      where: { id: session.userId },
    }),
    prisma.auditLog.create({
      data: {
        action: "security.password_changed",
        metadata: { sessionId: session.sessionId },
        userId: session.userId,
      },
    }),
  ]);

  return ok({ updated: true });
}
