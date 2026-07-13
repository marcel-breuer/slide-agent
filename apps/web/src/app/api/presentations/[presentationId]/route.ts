import { z } from "zod";

import {
  ensureDemoPresentation,
  findPresentationDocument,
  PresentationForbiddenError,
  PresentationNotFoundError,
  PresentationVersionConflictError,
  prisma,
  savePresentationDocument,
} from "@slide-agent/database";
import { DEMO_PRESENTATION_ID, PresentationDocumentSchema } from "@slide-agent/presentation-schema";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "@/lib/team-access";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const PresentationUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  document: PresentationDocumentSchema,
});

const PresentationMetadataUpdateSchema = z
  .object({
    archived: z.boolean().optional(),
    title: z.string().trim().min(1).max(180).optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const document = await findPresentationDocument(prisma, presentationId);
  if (!document) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  const access = await getPresentationAccess(presentationId, userId);
  if (document.metadata.ownerId !== userId && !access?.teamId) {
    return fail("FORBIDDEN", "Presentation is not available for this user.", 403);
  }

  return ok(document);
}

export async function PUT(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PresentationUpdateSchema.safeParse(body);
  if (!parsed.success)
    return fail("VALIDATION_FAILED", "Presentation document update is invalid.", 400);

  const access = await getPresentationAccess(presentationId, userId);
  if (!canAccess(access, "edit")) {
    return fail("FORBIDDEN", "Presentation is not available for editing by this user.", 403);
  }

  try {
    const document = await savePresentationDocument(prisma, {
      presentationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      document: parsed.data.document,
      ...(access?.teamId ? {} : { ownerId: userId }),
    });

    return ok(document);
  } catch (error) {
    if (error instanceof PresentationNotFoundError) {
      return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
    }

    if (error instanceof PresentationVersionConflictError) {
      return fail(
        "PRESENTATION_VERSION_CONFLICT",
        "Presentation changed since it was loaded.",
        409,
      );
    }

    if (error instanceof PresentationForbiddenError) {
      return fail("FORBIDDEN", "Presentation is not available for this user.", 403);
    }

    if (error instanceof Error) {
      return fail("VALIDATION_FAILED", error.message, 400);
    }

    return fail("SAVE_FAILED", "Presentation could not be saved.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PresentationMetadataUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Presentation update is invalid.", 400);

  const { presentationId } = await context.params;
  const access = await getPresentationAccess(presentationId, userId);
  if (!canAccess(access, "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }
  const updateResult = await prisma.presentation.updateMany({
    where: { id: presentationId, ...activePresentationScope(userId) },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.archived !== undefined
        ? {
            archivedAt: parsed.data.archived ? new Date() : null,
            status: parsed.data.archived ? "ARCHIVED" : "EDITING",
          }
        : {}),
    },
  });

  if (updateResult.count !== 1) {
    return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  }

  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      requestedSlideCount: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  return ok({
    id: presentation.id,
    projectId: presentation.projectId,
    title: presentation.title,
    status: presentation.status,
    requestedSlideCount: presentation.requestedSlideCount,
    archivedAt: presentation.archivedAt?.toISOString() ?? null,
    createdAt: presentation.createdAt.toISOString(),
    updatedAt: presentation.updatedAt.toISOString(),
    editorUrl: `/app/presentations/${encodeURIComponent(presentation.id)}/editor`,
  });
}
