/* global structuredClone */

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { buildPresentationDocument, prisma, type Prisma } from "@slide-agent/database";
import { validatePresentation } from "@slide-agent/presentation-schema";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "@/lib/team-access";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const DuplicateInputSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = DuplicateInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Duplicate input is invalid.", 400);

  const { presentationId } = await context.params;
  const source = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId), archivedAt: null },
    include: {
      project: {
        select: {
          archivedAt: true,
        },
      },
      slides: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!source || source.project.archivedAt) {
    return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  }
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to duplicate this presentation.", 403);
  }

  const now = new Date().toISOString();
  const nextPresentationId = randomUUID();
  const sourceDocument = buildPresentationDocument(source);
  const title = parsed.data.title ?? `${source.title} copy`;
  const document = validatePresentation({
    ...sourceDocument,
    id: nextPresentationId,
    title,
    metadata: {
      ...sourceDocument.metadata,
      createdAt: now,
      updatedAt: now,
      ownerId: userId,
    },
    slides: sourceDocument.slides.map((slide, index) => ({
      ...structuredClone(slide),
      id: randomUUID(),
      order: index + 1,
    })),
  });

  const presentation = await prisma.presentation.create({
    data: {
      id: document.id,
      ownerId: userId,
      projectId: source.projectId,
      title: document.title,
      status: "EDITING",
      requestedSlideCount: document.slides.length,
      format: document.format,
      outputLanguage: document.locale,
      designContext: { theme: document.theme },
      slides: {
        create: document.slides.map((slide) => ({
          id: slide.id,
          order: slide.order,
          document: slide as Prisma.InputJsonValue,
        })),
      },
    },
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

  return ok(
    {
      id: presentation.id,
      projectId: presentation.projectId,
      title: presentation.title,
      status: presentation.status,
      requestedSlideCount: presentation.requestedSlideCount,
      archivedAt: presentation.archivedAt?.toISOString() ?? null,
      createdAt: presentation.createdAt.toISOString(),
      updatedAt: presentation.updatedAt.toISOString(),
      editorUrl: `/app/presentations/${encodeURIComponent(presentation.id)}/editor`,
    },
    201,
  );
}
