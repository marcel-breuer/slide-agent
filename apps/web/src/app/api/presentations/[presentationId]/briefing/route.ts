import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const BriefingInputSchema = z.object({
  audience: z.string().trim().min(1).max(1000),
  context: z.string().trim().max(2000).optional(),
  goal: z.string().trim().min(1).max(1000),
  requirements: z.string().trim().max(2000).optional(),
  successCriteria: z.string().trim().max(1000).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId },
    select: {
      id: true,
      briefings: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true, answers: true, createdAt: true, updatedAt: true },
      },
    },
  });

  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  const briefing = presentation.briefings[0] ?? null;

  return ok(
    briefing
      ? {
          id: briefing.id,
          presentationId,
          answers: briefing.answers,
          createdAt: briefing.createdAt.toISOString(),
          updatedAt: briefing.updatedAt.toISOString(),
        }
      : null,
  );
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

  const parsed = BriefingInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Briefing input is invalid.", 400);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId, archivedAt: null },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const briefing = await prisma.briefing.create({
    data: {
      presentationId,
      answers: parsed.data,
    },
    select: { id: true, answers: true, createdAt: true, updatedAt: true },
  });

  await prisma.presentation.updateMany({
    where: { id: presentationId, ownerId: userId },
    data: { status: "BRIEFING" },
  });

  return ok(
    {
      id: briefing.id,
      presentationId,
      answers: briefing.answers,
      createdAt: briefing.createdAt.toISOString(),
      updatedAt: briefing.updatedAt.toISOString(),
    },
    201,
  );
}
