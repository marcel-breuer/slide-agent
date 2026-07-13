import { prisma, type Prisma } from "@slide-agent/database";

export const TEAM_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamPermission = "read" | "edit" | "manage";

const ROLE_RANK: Record<TeamRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export type TeamMembershipAccess = {
  id: string;
  role: TeamRole;
  teamId: string;
  userId: string;
};

export type ProjectAccess = {
  projectId: string;
  role: TeamRole | "OWNER";
  teamId: string | null;
  userId: string;
};

export function activeProjectScope(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { teamId: null, ownerId: userId },
      {
        team: {
          members: {
            some: { revokedAt: null, userId },
          },
        },
      },
    ],
  };
}

export function activePresentationScope(userId: string): Prisma.PresentationWhereInput {
  return {
    OR: [
      { ownerId: userId, project: { teamId: null } },
      {
        project: {
          team: {
            members: {
              some: { revokedAt: null, userId },
            },
          },
        },
      },
    ],
  };
}

export function teamRoleCan(role: TeamRole, permission: TeamPermission): boolean {
  const requiredRank = permission === "manage" ? ROLE_RANK.ADMIN : permission === "edit" ? ROLE_RANK.EDITOR : ROLE_RANK.VIEWER;
  return ROLE_RANK[role] >= requiredRank;
}

export async function getTeamMembership(
  teamId: string,
  userId: string,
): Promise<TeamMembershipAccess | null> {
  return prisma.teamMembership.findFirst({
    where: { teamId, userId, revokedAt: null },
    select: { id: true, role: true, teamId: true, userId: true },
  }) as Promise<TeamMembershipAccess | null>;
}

export async function getProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  if (!prisma.project?.findFirst) {
    return { projectId, role: "OWNER", teamId: null, userId };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...activeProjectScope(userId) },
    select: {
      id: true,
      ownerId: true,
      teamId: true,
      team: {
        select: {
          members: {
            where: { revokedAt: null, userId },
            select: { role: true },
          },
        },
      },
    },
  });

  if (project === undefined) {
    return { projectId, role: "OWNER", teamId: null, userId };
  }
  if (!project) return null;
  if (!project.teamId && (project.ownerId === userId || project.ownerId === undefined)) {
    return { projectId: project.id, role: "OWNER", teamId: null, userId };
  }

  const role = project.team?.members[0]?.role;
  return role ? { projectId: project.id, role, teamId: project.teamId, userId } : null;
}

export async function getPresentationAccess(
  presentationId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  if (!prisma.presentation?.findFirst) {
    return { projectId: presentationId, role: "OWNER", teamId: null, userId };
  }
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: { ownerId: true, project: { select: { id: true } } },
  });
  if (presentation === undefined) {
    return { projectId: presentationId, role: "OWNER", teamId: null, userId };
  }
  if (!presentation) return null;

  if (!presentation.project) {
    return presentation.ownerId === undefined || presentation.ownerId === userId
      ? { projectId: presentationId, role: "OWNER", teamId: null, userId }
      : null;
  }

  return getProjectAccess(presentation.project.id, userId);
}

export function canAccess(access: ProjectAccess | null, permission: TeamPermission): boolean {
  return Boolean(access && teamRoleCan(access.role, permission));
}
