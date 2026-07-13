import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { serializeComment } from "@/lib/presentation-comments";
import { getAuthenticatedUserId } from "@/lib/server-session";

const CommentActionSchema = z.object({ action: z.enum(["resolve", "reopen", "delete"]) });

type RouteContext = { params: Promise<{ commentId: string; presentationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = CommentActionSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Comment action is invalid.", 400);

  const { commentId, presentationId } = await context.params;
  const comment = await prisma.presentationComment.findFirst({
    where: { id: commentId, presentationId, presentation: { ownerId: userId } },
    select: { id: true, status: true },
  });
  if (!comment) return fail("COMMENT_NOT_FOUND", "Comment was not found.", 404);

  const now = new Date();
  const data =
    parsed.data.action === "resolve"
      ? { deletedAt: null, resolvedAt: now, resolvedById: userId, status: "RESOLVED" as const }
      : parsed.data.action === "reopen"
        ? { deletedAt: null, resolvedAt: null, resolvedById: null, status: "OPEN" as const }
        : { deletedAt: now, deletedById: userId };

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.presentationComment.update({ where: { id: commentId }, data });
    await transaction.presentationCommentEvent.create({
      data: { action: parsed.data.action, actorId: userId, commentId },
    });
    return transaction.presentationComment.findUniqueOrThrow({
      where: { id: commentId },
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
    });
  });

  return ok(serializeComment(updated));
}
