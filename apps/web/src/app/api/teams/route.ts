import { randomUUID } from "node:crypto";

import { prisma } from "@slide-agent/database";

import { TeamInputSchema, fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const memberships = await prisma.teamMembership.findMany({
    where: { revokedAt: null, userId },
    orderBy: { team: { name: "asc" } },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { members: true, projects: true } },
        },
      },
    },
  });

  return ok(
    memberships.map(({ role, team }) => ({
      id: team.id,
      name: team.name,
      role,
      memberCount: team._count.members,
      projectCount: team._count.projects,
      createdAt: team.createdAt.toISOString(),
    })),
  );
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = TeamInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Team input is invalid.", 400);

  const team = await prisma.$transaction(async (transaction) => {
    const created = await transaction.team.create({
      data: { createdById: userId, id: randomUUID(), name: parsed.data.name },
      select: { id: true, name: true, createdAt: true },
    });
    await transaction.teamMembership.create({
      data: { role: "OWNER", teamId: created.id, userId },
    });
    await transaction.teamMembershipAuditLog.create({
      data: {
        action: "TEAM_CREATED",
        actorId: userId,
        metadata: { name: created.name },
        subjectUserId: userId,
        teamId: created.id,
      },
    });
    return created;
  });

  return ok({ ...team, role: "OWNER", createdAt: team.createdAt.toISOString() }, 201);
}
