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

const BriefingInputSchema = z.object({
  approved: z.boolean().default(false),
  audience: z.string().trim().min(1).max(1000),
  context: z.string().trim().max(2000).optional(),
  followUps: z
    .array(
      z.object({
        answer: z.string().trim().max(1000).default(""),
        question: z.string().trim().min(1).max(240),
      }),
    )
    .max(8)
    .default([]),
  goal: z.string().trim().min(1).max(1000),
  references: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        note: z.string().trim().max(500).optional(),
        type: z.enum(["attachment", "link", "note"]).default("note"),
      }),
    )
    .max(12)
    .default([]),
  requirements: z.string().trim().max(2000).optional(),
  successCriteria: z.string().trim().max(1000).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
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
    where: { id: presentationId, ...activePresentationScope(userId), archivedAt: null },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }

  const briefing = await prisma.briefing.create({
    data: {
      presentationId,
      answers: {
        ...parsed.data,
        readiness: calculateBriefingReadiness(parsed.data),
      },
    },
    select: { id: true, answers: true, createdAt: true, updatedAt: true },
  });

  await prisma.presentation.updateMany({
    where: { id: presentationId, ...activePresentationScope(userId) },
    data: { status: parsed.data.approved ? "STORYLINE_REVIEW" : "BRIEFING" },
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

function calculateBriefingReadiness(answers: z.infer<typeof BriefingInputSchema>) {
  const answeredFollowUps = answers.followUps.filter((followUp) => followUp.answer.trim()).length;
  const requiredFields = [
    answers.goal,
    answers.audience,
    answers.successCriteria ?? "",
    answers.requirements ?? "",
  ];
  const completedRequiredFields = requiredFields.filter((value) => value.trim()).length;
  const score = Math.round(
    ((completedRequiredFields + Math.min(answeredFollowUps, 2)) / (requiredFields.length + 2)) *
      100,
  );

  return {
    approved: answers.approved,
    answeredFollowUps,
    referenceCount: answers.references.length,
    score,
  };
}
