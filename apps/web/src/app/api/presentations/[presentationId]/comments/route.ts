import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import {
  hasElement,
  MAX_COMMENT_LENGTH,
  sanitizeCommentBody,
  serializeComment,
} from "@/lib/presentation-comments";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope } from "@/lib/team-access";

const CommentInputSchema = z.object({
  body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
  elementId: z.string().trim().min(1).max(120).nullable().optional(),
  mentions: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  slideId: z.string().trim().min(1).max(120),
});

type RouteContext = { params: Promise<{ presentationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const [comments, unresolvedCount] = await Promise.all([
    prisma.presentationComment.findMany({
      where: { presentationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { displayName: true, email: true, id: true } },
        events: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { displayName: true, email: true, id: true } } },
        },
        mentions: { select: { mentionedUserId: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { displayName: true, email: true, id: true } } },
        },
      },
    }),
    prisma.presentationComment.count({
      where: { presentationId, status: "OPEN", deletedAt: null },
    }),
  ]);

  return ok({
    comments: comments.map(serializeComment),
    presentationId,
    unresolvedCount,
  });
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

  const parsed = CommentInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Comment input is invalid.", 400);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: {
      id: true,
      ownerId: true,
      slides: { select: { id: true, document: true } },
    },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const slide = presentation.slides.find((candidate) => candidate.id === parsed.data.slideId);
  if (!slide) return fail("SLIDE_NOT_FOUND", "Comment slide was not found.", 404);
  if (parsed.data.elementId && !hasElement(slide.document, parsed.data.elementId)) {
    return fail("ELEMENT_NOT_FOUND", "Comment element was not found on the slide.", 404);
  }

  const mentionIds = [...new Set(parsed.data.mentions)];
  if (mentionIds.some((mentionedUserId) => mentionedUserId !== presentation.ownerId)) {
    return fail("FORBIDDEN", "Comments can only mention authorized workspace members.", 403);
  }

  const comment = await prisma.$transaction(async (transaction) => {
    const created = await transaction.presentationComment.create({
      data: {
        authorId: userId,
        body: sanitizeCommentBody(parsed.data.body),
        elementId: parsed.data.elementId ?? null,
        presentationId,
        slideId: parsed.data.slideId,
      },
    });
    await transaction.presentationCommentEvent.create({
      data: { action: "created", actorId: userId, commentId: created.id },
    });
    if (mentionIds.length > 0) {
      await transaction.presentationCommentMention.createMany({
        data: mentionIds.map((mentionedUserId) => ({ commentId: created.id, mentionedUserId })),
      });
      await transaction.presentationCommentNotification.createMany({
        data: mentionIds
          .filter((recipientId) => recipientId !== userId)
          .map((recipientId) => ({
            commentId: created.id,
            kind: "mention",
            recipientId,
          })),
      });
    }
    return transaction.presentationComment.findUniqueOrThrow({
      where: { id: created.id },
      include: commentInclude,
    });
  });

  return ok(serializeComment(comment), 201);
}

const commentInclude = {
  author: { select: { displayName: true, email: true, id: true } },
  events: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { displayName: true, email: true, id: true } } },
  },
  mentions: { select: { mentionedUserId: true } },
  replies: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { displayName: true, email: true, id: true } } },
  },
};
