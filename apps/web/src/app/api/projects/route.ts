import { prisma } from "@slide-agent/database";

import { ProjectInputSchema, fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const projects = await prisma.project.findMany({
    where: {
      ownerId: userId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          presentations: true,
        },
      },
      presentations: {
        where: { archivedAt: null },
        select: { id: true },
      },
    },
  });

  return ok(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      presentationCount: project._count.presentations,
      activePresentationCount: project.presentations.length,
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

  const parsed = ProjectInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Project input is invalid.", 400);

  const project = await prisma.project.create({
    data: {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return ok(
    {
      id: project.id,
      name: project.name,
      description: project.description,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      presentationCount: 0,
      activePresentationCount: 0,
    },
    201,
  );
}
