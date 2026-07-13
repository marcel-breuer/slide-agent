import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { MAX_COMMENT_LENGTH, sanitizeCommentBody } from "@/lib/presentation-comments";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope } from "@/lib/team-access";

const ReplySchema = z.object({ body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH) });
type RouteContext = { params: Promise<{ commentId: string; presentationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Reply input is invalid.", 400);

  const { commentId, presentationId } = await context.params;
  const comment = await prisma.presentationComment.findFirst({
    where: { id: commentId, presentationId, presentation: activePresentationScope(userId), deletedAt: null },
    select: { id: true },
  });
  if (!comment) return fail("COMMENT_NOT_FOUND", "Comment was not found.", 404);

  const reply = await prisma.$transaction(async (transaction) => {
    const created = await transaction.presentationCommentReply.create({
      data: { authorId: userId, body: sanitizeCommentBody(parsed.data.body), commentId },
    });
    await transaction.presentationCommentEvent.create({
      data: { action: "replied", actorId: userId, commentId, metadata: { replyId: created.id } },
    });
    return created;
  });

  return ok(
    {
      author: { displayName: "", id: userId },
      authorId: userId,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      id: reply.id,
    },
    201,
  );
}
