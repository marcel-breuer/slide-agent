import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "@/lib/team-access";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const StorylineInputSchema = z.object({
  generated: z.boolean().default(false),
  method: z.string().trim().min(1).max(120).default("Manual outline"),
  name: z.string().trim().min(1).max(160),
  outline: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
  proposalSummary: z.string().trim().max(1000).optional(),
  rationale: z.string().trim().min(1).max(1000),
  scopeEstimate: z
    .object({
      confidence: z.enum(["low", "medium", "high"]).default("medium"),
      estimatedMinutes: z.number().int().min(1).max(240),
      slideCount: z.number().int().min(1).max(80),
    })
    .optional(),
});

const StorylineApprovalSchema = z.object({
  approved: z.literal(true),
  storylineVersionId: z.string().trim().min(1),
});

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
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
    where: { id: presentationId, ...activePresentationScope(userId), archivedAt: null },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }

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
            generated: parsed.data.generated,
            proposalSummary: parsed.data.proposalSummary ?? null,
            sections: parsed.data.outline.map((title, index) => ({
              order: index + 1,
              title,
            })),
            scopeEstimate: parsed.data.scopeEstimate ?? {
              confidence: "medium",
              estimatedMinutes: Math.max(5, parsed.data.outline.length * 3),
              slideCount: parsed.data.outline.length,
            },
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
    where: { id: presentationId, ...activePresentationScope(userId) },
    data: {
      activeStorylineVersionId: storyline.versions[0]?.id ?? null,
      status: "STORYLINE_REVIEW",
    },
  });

  return ok(toStorylineSummary(storyline), 201);
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

  const parsed = StorylineApprovalSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Storyline approval is invalid.", 400);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId), archivedAt: null },
    select: {
      id: true,
      storylines: {
        where: {
          versions: {
            some: { id: parsed.data.storylineVersionId },
          },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!presentation || presentation.storylines.length === 0) {
    return fail("STORYLINE_VERSION_NOT_FOUND", "Storyline version was not found.", 404);
  }
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }

  const approvedAt = new Date();
  const updateResult = await prisma.storylineVersion.updateMany({
    where: {
      id: parsed.data.storylineVersionId,
      storyline: {
        presentation: {
          id: presentationId,
          ...activePresentationScope(userId),
        },
      },
    },
    data: { approvedAt },
  });
  if (updateResult.count !== 1) {
    return fail("STORYLINE_VERSION_NOT_FOUND", "Storyline version was not found.", 404);
  }

  await prisma.presentation.updateMany({
    where: { id: presentationId, ...activePresentationScope(userId) },
    data: {
      activeStorylineVersionId: parsed.data.storylineVersionId,
      status: "APPROVED",
    },
  });

  return ok({
    approvedAt: approvedAt.toISOString(),
    presentationId,
    storylineVersionId: parsed.data.storylineVersionId,
  });
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
