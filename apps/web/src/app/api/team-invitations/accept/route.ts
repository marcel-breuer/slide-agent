import { createHash } from "node:crypto";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedSession } from "@/lib/server-auth-session";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const token =
    typeof body === "object" && body !== null && "token" in body && typeof body.token === "string"
      ? body.token.trim()
      : "";
  if (token.length < 32 || token.length > 160) {
    return fail("VALIDATION_FAILED", "Invitation token is invalid.", 400);
  }

  const invitation = await prisma.teamInvitation.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    select: { id: true, email: true, expiresAt: true, role: true, status: true, teamId: true },
  });
  if (!invitation) return fail("INVITATION_NOT_FOUND", "Invitation was not found.", 404);
  if (invitation.status !== "PENDING") {
    return fail("INVITATION_INACTIVE", "This invitation is no longer active.", 409);
  }
  if (invitation.expiresAt <= new Date()) {
    await prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return fail("INVITATION_EXPIRED", "This invitation has expired.", 410);
  }
  if (invitation.email !== session.email.toLowerCase()) {
    return fail("INVITATION_EMAIL_MISMATCH", "This invitation belongs to another email address.", 403);
  }

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.teamMembership.findUnique({
      where: { teamId_userId: { teamId: invitation.teamId, userId: session.userId } },
      select: { id: true },
    });
    if (existing) {
      await transaction.teamMembership.update({
        where: { id: existing.id },
        data: { revokedAt: null, role: invitation.role },
      });
    } else {
      await transaction.teamMembership.create({
        data: { role: invitation.role, teamId: invitation.teamId, userId: session.userId },
      });
    }
    await transaction.teamInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: session.userId, status: "ACCEPTED" },
    });
    await transaction.teamMembershipAuditLog.create({
      data: {
        action: "INVITATION_ACCEPTED",
        actorId: session.userId,
        metadata: { invitationId: invitation.id, role: invitation.role },
        subjectUserId: session.userId,
        teamId: invitation.teamId,
      },
    });
  });

  return ok({ teamId: invitation.teamId, role: invitation.role, accepted: true });
}
