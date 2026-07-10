import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedSession } from "@/lib/server-auth-session";
import { z } from "zod";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

const SessionRevokeSchema = z.object({
  confirmation: z.literal("REVOKE_SESSION"),
});

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = SessionRevokeSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Explicit session revocation confirmation is required.", 400);
  }

  const { sessionId } = await context.params;
  const deleteResult = await prisma.session.deleteMany({
    where: { id: sessionId, userId: session.userId },
  });

  if (deleteResult.count !== 1) {
    return fail("SESSION_NOT_FOUND", "Session was not found.", 404);
  }

  await prisma.auditLog.create({
    data: {
      action: "security.session_revoked",
      metadata: {
        currentSession: sessionId === session.sessionId,
        sessionId,
      },
      userId: session.userId,
    },
  });

  return ok({ revoked: true });
}
