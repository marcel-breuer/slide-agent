import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { canAccess, getTeamMembership } from "@/lib/team-access";

type RouteContext = { params: Promise<{ teamId: string }> };

const TeamUpdateSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId } = await context.params;
  const membership = await getTeamMembership(teamId, userId);
  if (!membership || !canAccess({ projectId: "", role: membership.role, teamId, userId }, "read")) {
    return fail("TEAM_NOT_FOUND", "Team was not found.", 404);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        where: { revokedAt: null },
        orderBy: [{ role: "asc" }, { user: { displayName: "asc" } }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      invitations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, metadata: true, createdAt: true, actorId: true, subjectUserId: true },
      },
    },
  });
  if (!team) return fail("TEAM_NOT_FOUND", "Team was not found.", 404);

  return ok({
    ...team,
    createdAt: team.createdAt.toISOString(),
    members: team.members.map((member) => ({
      ...member,
      createdAt: member.createdAt.toISOString(),
      user: { ...member.user, displayName: member.user.displayName ?? member.user.email },
    })),
    invitations: team.invitations.map((invitation) => ({
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
    })),
    auditEvents: team.auditEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId } = await context.params;
  const membership = await getTeamMembership(teamId, userId);
  if (!membership || !canAccess({ projectId: "", role: membership.role, teamId, userId }, "manage")) {
    return fail("FORBIDDEN", "Only team owners and admins can update this team.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = TeamUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Team update is invalid.", 400);

  const team = await prisma.team.updateMany({ where: { id: teamId }, data: { name: parsed.data.name } });
  if (team.count !== 1) return fail("TEAM_NOT_FOUND", "Team was not found.", 404);
  await prisma.teamMembershipAuditLog.create({
    data: { action: "TEAM_RENAMED", actorId: userId, metadata: { name: parsed.data.name }, teamId },
  });
  return ok({ id: teamId, name: parsed.data.name });
}
