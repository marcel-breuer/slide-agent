import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { canAccess, getTeamMembership } from "@/lib/team-access";

type RouteContext = { params: Promise<{ teamId: string; invitationId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId, invitationId } = await context.params;
  const actor = await getTeamMembership(teamId, userId);
  if (!actor || !canAccess({ projectId: "", role: actor.role, teamId, userId }, "manage")) {
    return fail("FORBIDDEN", "Only team owners and admins can revoke invitations.", 403);
  }

  const result = await prisma.teamInvitation.updateMany({
    where: { id: invitationId, teamId, status: "PENDING" },
    data: { revokedAt: new Date(), status: "REVOKED" },
  });
  if (result.count !== 1) return fail("INVITATION_NOT_FOUND", "Invitation was not found.", 404);
  await prisma.teamMembershipAuditLog.create({
    data: { action: "INVITATION_REVOKED", actorId: userId, metadata: { invitationId }, teamId },
  });
  return ok({ id: invitationId, status: "REVOKED" });
}
