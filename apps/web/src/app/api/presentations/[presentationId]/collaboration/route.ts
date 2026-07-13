import { z } from "zod";

import { applyCommand, type EditorCommand } from "@slide-agent/editor-core";
import {
  buildPresentationDocument,
  findPresentationDocument,
  prisma,
  type Prisma,
} from "@slide-agent/database";
import { validatePresentation } from "@slide-agent/presentation-schema";

import { fail, ok } from "@/lib/api";
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "@/lib/billing";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "@/lib/team-access";

const SESSION_TTL_MS = 30_000;

const CollaborationHeartbeatSchema = z.object({
  clientId: z.string().trim().min(16).max(120),
  knownUpdatedAt: z.string().datetime(),
  operation: z
    .object({
      command: z.unknown(),
      operationId: z.string().trim().min(16).max(120),
    })
    .optional(),
  selectedSlideId: z.string().trim().min(1).max(120).nullable().optional(),
  sinceSequence: z.number().int().nonnegative().optional(),
});

const EditorCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MOVE_ELEMENT"),
    slideId: z.string(),
    elementId: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    type: z.literal("RESIZE_ELEMENT"),
    slideId: z.string(),
    elementId: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({ type: z.literal("DELETE_ELEMENT"), slideId: z.string(), elementId: z.string() }),
  z.object({ type: z.literal("RENAME_SLIDE"), slideId: z.string(), title: z.string() }),
  z.object({
    type: z.literal("UPDATE_SHAPE_FILL"),
    slideId: z.string(),
    elementId: z.string(),
    fill: z.string(),
  }),
  z.object({ type: z.literal("UPDATE_SLIDE_BACKGROUND"), slideId: z.string(), color: z.string() }),
  z.object({ type: z.literal("UPDATE_THEME_ACCENT"), color: z.string() }),
  z.object({ type: z.literal("DUPLICATE_SLIDE"), slideId: z.string(), newSlideId: z.string() }),
  z.object({
    type: z.literal("ADD_SLIDE_AFTER"),
    afterSlideId: z.string().optional(),
    slide: z.unknown(),
  }),
  z.object({ type: z.literal("ADD_SLIDE"), slide: z.unknown() }),
  z.object({ type: z.literal("DELETE_SLIDE"), slideId: z.string() }),
  z.object({ type: z.literal("MOVE_SLIDE"), slideId: z.string(), toIndex: z.number().int() }),
  z.object({
    type: z.literal("SET_SLIDE_AI_METADATA"),
    slideId: z.string(),
    metadata: z.unknown(),
  }),
]);

class CollaborationConflictError extends Error {
  constructor() {
    super("The presentation changed while applying the collaboration operation.");
    this.name = "CollaborationConflictError";
  }
}

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = CollaborationHeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Collaboration heartbeat is invalid.", 400);
  }

  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: { id: true, updatedAt: true },
  });
  if (!presentation) {
    return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  }
  const access = await getPresentationAccess(presentationId, userId);
  if (!access) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  try {
    await assertBillingQuota(userId, "members", 0);
  } catch (error) {
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    throw error;
  }

  let operationResult: Awaited<ReturnType<typeof applyCollaborationOperation>> | null = null;
  if (parsed.data.operation) {
    if (!canAccess(access, "edit")) {
      return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
    }
    const command = EditorCommandSchema.safeParse(parsed.data.operation.command);
    if (!command.success) {
      return fail("VALIDATION_FAILED", "Collaboration operation is invalid.", 400);
    }

    try {
      operationResult = await applyCollaborationOperation({
        actorId: userId,
        baseUpdatedAt: parsed.data.knownUpdatedAt,
        clientId: parsed.data.clientId,
        command: command.data as EditorCommand,
        operationId: parsed.data.operation.operationId,
        presentationId,
      });
    } catch (error) {
      if (error instanceof CollaborationConflictError) {
        return fail(
          "PRESENTATION_VERSION_CONFLICT",
          "The presentation changed while applying this collaboration operation. Reload and retry.",
          409,
        );
      }
      if (error instanceof Error) {
        return fail("COLLABORATION_OPERATION_FAILED", error.message, 400);
      }
      return fail("COLLABORATION_OPERATION_FAILED", "Collaboration operation failed.", 500);
    }
  }

  const now = new Date();
  const activeSince = new Date(now.getTime() - SESSION_TTL_MS);

  await prisma.presentationCollaboratorSession.deleteMany({
    where: { presentationId, lastSeenAt: { lt: activeSince } },
  });
  await prisma.presentationCollaboratorSession.upsert({
    where: {
      presentationId_userId_clientId: {
        clientId: parsed.data.clientId,
        presentationId,
        userId,
      },
    },
    update: {
      lastSeenAt: now,
      selectedSlideId: parsed.data.selectedSlideId ?? null,
    },
    create: {
      clientId: parsed.data.clientId,
      lastSeenAt: now,
      presentationId,
      selectedSlideId: parsed.data.selectedSlideId ?? null,
      userId,
    },
  });

  const sessions = await prisma.presentationCollaboratorSession.findMany({
    where: { presentationId, lastSeenAt: { gte: activeSince } },
    orderBy: [{ lastSeenAt: "desc" }],
    select: {
      clientId: true,
      id: true,
      lastSeenAt: true,
      selectedSlideId: true,
      user: { select: { displayName: true, email: true, id: true } },
    },
  });

  const currentUpdatedAt = presentation.updatedAt.toISOString();
  const document = operationResult?.document
    ? operationResult.document
    : parsed.data.knownUpdatedAt === currentUpdatedAt
      ? null
      : await findPresentationDocument(prisma, presentationId);

  const operationSequence = await prisma.presentationCollaborationOperation.findFirst({
    where: { presentationId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  return ok({
    collaborators: sessions.map((session) => ({
      clientId: session.clientId,
      displayName: session.user.displayName ?? session.user.email,
      id: session.id,
      lastSeenAt: session.lastSeenAt.toISOString(),
      selectedSlideId: session.selectedSlideId,
      userId: session.user.id,
    })),
    currentUpdatedAt: operationResult?.updatedAt.toISOString() ?? currentUpdatedAt,
    document,
    operationSequence: operationSequence?.sequence ?? 0,
  });
}

async function applyCollaborationOperation({
  actorId,
  baseUpdatedAt,
  clientId,
  command,
  operationId,
  presentationId,
}: {
  actorId: string;
  baseUpdatedAt: string;
  clientId: string;
  command: EditorCommand;
  operationId: string;
  presentationId: string;
}): Promise<{ document: Awaited<ReturnType<typeof findPresentationDocument>>; updatedAt: Date }> {
  const baseUpdatedAtDate = new Date(baseUpdatedAt);
  if (Number.isNaN(baseUpdatedAtDate.getTime())) {
    throw new Error("Operation base timestamp is invalid.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.presentationCollaborationOperation.findUnique({
          where: { presentationId_operationId: { operationId, presentationId } },
          select: { resultUpdatedAt: true },
        });
        if (duplicate) {
          const document = await findPresentationDocument(transaction, presentationId);
          if (!document) throw new Error("Presentation was not found.");
          return { document, updatedAt: duplicate.resultUpdatedAt };
        }

        const existing = await transaction.presentation.findUnique({
          where: { id: presentationId },
          include: { slides: { orderBy: { order: "asc" } } },
        });
        if (!existing) throw new Error("Presentation was not found.");

        const currentDocument = buildPresentationDocument(existing);
        const nextDocument = validatePresentation(applyCommand(currentDocument, command));
        const updateResult = await transaction.presentation.updateMany({
          where: { id: presentationId, updatedAt: existing.updatedAt },
          data: {
            title: nextDocument.title,
            format: nextDocument.format,
            outputLanguage: nextDocument.locale,
            designContext: { theme: nextDocument.theme },
          },
        });
        if (updateResult.count !== 1) throw new CollaborationConflictError();

        await transaction.slide.deleteMany({ where: { presentationId } });
        await transaction.slide.createMany({
          data: nextDocument.slides.map((slide) => ({
            id: slide.id,
            document: slide,
            order: slide.order,
            presentationId,
          })),
        });

        const saved = await transaction.presentation.findUnique({
          where: { id: presentationId },
          include: { slides: { orderBy: { order: "asc" } } },
        });
        if (!saved) throw new Error("Presentation was not found after saving.");

        const operation = await transaction.presentationCollaborationOperation.create({
          data: {
            actorId,
            baseUpdatedAt: baseUpdatedAtDate,
            clientId,
            command: command as unknown as Prisma.InputJsonValue,
            operationId,
            presentationId,
            resultUpdatedAt: saved.updatedAt,
          },
        });

        return { document: buildPresentationDocument(saved), updatedAt: operation.resultUpdatedAt };
      });
    } catch (error) {
      if (error instanceof CollaborationConflictError && attempt < 2) continue;
      throw error;
    }
  }

  throw new CollaborationConflictError();
}
