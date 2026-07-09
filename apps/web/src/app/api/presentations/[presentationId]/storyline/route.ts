import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const StorylineInputSchema = z.object({
  method: z.string().trim().min(1).max(120).default("Manual outline"),
  name: z.string().trim().min(1).max(160),
  outline: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
  rationale: z.string().trim().min(1).max(1000),
});

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId },
    select: {
      id: true,
      storylines: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          method: true,
          rationale: true,
          createdAt: true,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { id: true, version: true, outline: true, approvedAt: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  return ok(presentation.storylines.map(toStorylineSummary));
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = StorylineInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Storyline input is invalid.", 400);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId, archivedAt: null },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const storyline = await prisma.storyline.create({
    data: {
      presentationId,
      name: parsed.data.name,
      method: parsed.data.method,
      rationale: parsed.data.rationale,
      versions: {
        create: {
          version: 1,
          outline: {
            sections: parsed.data.outline.map((title, index) => ({
              order: index + 1,
              title,
            })),
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      method: true,
      rationale: true,
      createdAt: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true, outline: true, approvedAt: true, createdAt: true },
      },
    },
  });

  await prisma.presentation.updateMany({
    where: { id: presentationId, ownerId: userId },
    data: {
      activeStorylineVersionId: storyline.versions[0]?.id ?? null,
      status: "STORYLINE_REVIEW",
    },
  });

  return ok(toStorylineSummary(storyline), 201);
}

type StorylineRecord = {
  id: string;
  name: string;
  method: string;
  rationale: string;
  createdAt: Date;
  versions: Array<{
    id: string;
    version: number;
    outline: unknown;
    approvedAt: Date | null;
    createdAt: Date;
  }>;
};

function toStorylineSummary(storyline: StorylineRecord) {
  const version = storyline.versions[0] ?? null;
  return {
    id: storyline.id,
    name: storyline.name,
    method: storyline.method,
    rationale: storyline.rationale,
    createdAt: storyline.createdAt.toISOString(),
    latestVersion: version
      ? {
          id: version.id,
          version: version.version,
          outline: version.outline,
          approvedAt: version.approvedAt?.toISOString() ?? null,
          createdAt: version.createdAt.toISOString(),
        }
      : null,
  };
}
