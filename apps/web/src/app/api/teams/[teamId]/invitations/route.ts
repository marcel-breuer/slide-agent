import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@slide-agent/database";

import { TeamInvitationInputSchema, fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { canAccess, getTeamMembership } from "@/lib/team-access";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId } = await context.params;
  const actor = await getTeamMembership(teamId, userId);
  if (!actor || !canAccess({ projectId: "", role: actor.role, teamId, userId }, "manage")) {
    return fail("FORBIDDEN", "Only team owners and admins can invite members.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = TeamInvitationInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Invitation input is invalid.", 400);
  if (actor.role !== "OWNER" && parsed.data.role === "ADMIN") {
    return fail("FORBIDDEN", "Only the team owner can invite admins.", 403);
  }

  const email = parsed.data.email.toLowerCase();
  const existingMember = await prisma.teamMembership.findFirst({
    where: { teamId, revokedAt: null, user: { email } },
    select: { id: true },
  });
  if (existingMember) return fail("ALREADY_MEMBER", "This user is already a team member.", 409);

  const pending = await prisma.teamInvitation.findFirst({
    where: { email, status: "PENDING", teamId, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (pending) return fail("INVITATION_EXISTS", "A pending invitation already exists.", 409);

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.teamInvitation.create({
    data: {
      email,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedById: userId,
      role: parsed.data.role,
      teamId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    },
    select: { id: true, email: true, role: true, status: true, expiresAt: true },
  });
  await prisma.teamMembershipAuditLog.create({
    data: {
      action: "INVITATION_CREATED",
      actorId: userId,
      metadata: { email, role: invitation.role },
      teamId,
    },
  });

  return ok(
    {
      ...invitation,
      expiresAt: invitation.expiresAt.toISOString(),
      token,
    },
    201,
  );
}
