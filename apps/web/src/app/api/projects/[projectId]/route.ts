import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activeProjectScope, canAccess, getProjectAccess, getTeamMembership } from "@/lib/team-access";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

const ProjectUpdateSchema = z
  .object({
    archived: z.boolean().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    teamId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { projectId } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...activeProjectScope(userId) },
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      teamId: true,
      presentations: {
        orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          requestedSlideCount: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!project) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);

  return ok({
    id: project.id,
    teamId: project.teamId,
    name: project.name,
    description: project.description,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    presentations: project.presentations.map((presentation) => ({
      id: presentation.id,
      title: presentation.title,
      status: presentation.status,
      requestedSlideCount: presentation.requestedSlideCount,
      archivedAt: presentation.archivedAt?.toISOString() ?? null,
      createdAt: presentation.createdAt.toISOString(),
      updatedAt: presentation.updatedAt.toISOString(),
      editorUrl: `/app/presentations/${encodeURIComponent(presentation.id)}/editor`,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = ProjectUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Project update is invalid.", 400);

  const { projectId } = await context.params;
  const access = await getProjectAccess(projectId, userId);
  if (!access) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);
  if (!canAccess(access, "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this project.", 403);
  }

  if (parsed.data.teamId !== undefined) {
    if (!canAccess(access, "manage")) {
      return fail("FORBIDDEN", "Only team owners and admins can move projects.", 403);
    }
    if (parsed.data.teamId) {
      const targetMembership = await getTeamMembership(parsed.data.teamId, userId);
      if (
        !targetMembership ||
        !canAccess(
          { projectId: "", role: targetMembership.role, teamId: parsed.data.teamId, userId },
          "edit",
        )
      ) {
        return fail("FORBIDDEN", "You cannot move projects into this team.", 403);
      }
    }
  }
  const updateResult = await prisma.project.updateMany({
    where: { id: projectId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description?.trim() ? parsed.data.description : null }
        : {}),
      ...(parsed.data.archived !== undefined
        ? { archivedAt: parsed.data.archived ? new Date() : null }
        : {}),
      ...(parsed.data.teamId !== undefined ? { teamId: parsed.data.teamId } : {}),
    },
  });

  if (updateResult.count !== 1) {
    return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...activeProjectScope(userId) },
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      teamId: true,
    },
  });

  if (!project) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);

  return ok({
    id: project.id,
    teamId: project.teamId,
    name: project.name,
    description: project.description,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
}
