import { prisma } from "@slide-agent/database";

import { TeamMemberUpdateSchema, fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { canAccess, getTeamMembership } from "@/lib/team-access";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId } = await context.params;
  const actor = await getTeamMembership(teamId, userId);
  if (!actor || !canAccess({ projectId: "", role: actor.role, teamId, userId }, "manage")) {
    return fail("FORBIDDEN", "Only team owners and admins can manage members.", 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = TeamMemberUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Member update is invalid.", 400);
  if (parsed.data.userId === userId && actor.role === "OWNER") {
    return fail("OWNER_REQUIRED", "The team owner must retain the owner role.", 409);
  }

  const target = await prisma.teamMembership.findFirst({
    where: { teamId, userId: parsed.data.userId, revokedAt: null },
    select: { id: true, role: true },
  });
  if (!target || target.role === "OWNER") return fail("MEMBER_NOT_FOUND", "Member was not found.", 404);
  if (actor.role !== "OWNER" && parsed.data.role === "ADMIN") {
    return fail("FORBIDDEN", "Only the team owner can grant admin access.", 403);
  }

  await prisma.$transaction([
    prisma.teamMembership.update({ where: { id: target.id }, data: { role: parsed.data.role } }),
    prisma.teamMembershipAuditLog.create({
      data: {
        action: "MEMBER_ROLE_CHANGED",
        actorId: userId,
        metadata: { from: target.role, to: parsed.data.role },
        subjectUserId: parsed.data.userId,
        teamId,
      },
    }),
  ]);
  return ok({ userId: parsed.data.userId, role: parsed.data.role });
}

export async function DELETE(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { teamId } = await context.params;
  const actor = await getTeamMembership(teamId, userId);
  if (!actor || !canAccess({ projectId: "", role: actor.role, teamId, userId }, "manage")) {
    return fail("FORBIDDEN", "Only team owners and admins can remove members.", 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = TeamMemberUpdateSchema.pick({ userId: true }).safeParse(body);
  if (!parsed.success || parsed.data.userId === userId) {
    return fail("VALIDATION_FAILED", "A different member must be selected.", 400);
  }

  const target = await prisma.teamMembership.findFirst({
    where: { teamId, userId: parsed.data.userId, revokedAt: null },
    select: { id: true, role: true },
  });
  if (!target || target.role === "OWNER") return fail("MEMBER_NOT_FOUND", "Member was not found.", 404);
  if (actor.role !== "OWNER" && target.role === "ADMIN") {
    return fail("FORBIDDEN", "Only the team owner can remove an admin.", 403);
  }

  await prisma.$transaction([
    prisma.teamMembership.update({ where: { id: target.id }, data: { revokedAt: new Date() } }),
    prisma.teamMembershipAuditLog.create({
      data: { action: "MEMBER_REMOVED", actorId: userId, subjectUserId: parsed.data.userId, teamId },
    }),
  ]);
  return ok({ userId: parsed.data.userId, removed: true });
}
