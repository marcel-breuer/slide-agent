/* global structuredClone */

import { randomUUID } from "node:crypto";

import { prisma, type Prisma } from "@slide-agent/database";
import { enforceSlideLimit } from "@slide-agent/presentation-schema";
import {
  createDemoPresentationDocument,
  validatePresentation,
} from "@slide-agent/presentation-schema";

import { PresentationInputSchema, fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const searchParams = new URL(request.url).searchParams;
  const projectId = searchParams.get("projectId")?.trim();
  const includeArchived = searchParams.get("includeArchived") === "true";

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });
    if (!project) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);
  }

  const presentations = await prisma.presentation.findMany({
    where: {
      ownerId: userId,
      ...(projectId ? { projectId } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
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

  return ok(presentations.map(toPresentationSummary));
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PresentationInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Presentation input is invalid.", 400);

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, ownerId: userId, archivedAt: null },
    select: { id: true },
  });
  if (!project) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  const requestedSlideCount = enforceSlideLimit(
    parsed.data.requestedSlideCount ?? settings.defaultSlideCount,
    50,
    settings.personalMaxSlideCount,
  );
  const document = createPresentationDocument({
    locale: settings.presentationLocale,
    ownerId: userId,
    presentationId: randomUUID(),
    slideCount: requestedSlideCount,
    title: parsed.data.title,
  });

  const presentation = await prisma.presentation.create({
    data: {
      id: document.id,
      ownerId: userId,
      projectId: project.id,
      title: document.title,
      status: "EDITING",
      requestedSlideCount,
      format: document.format,
      outputLanguage: document.locale,
      designContext: {
        defaults: {
          audience: settings.defaultAudience,
          detailLevel: settings.defaultDetailLevel,
          exportCompatibility: settings.defaultExportCompatibility,
          exportFormat: settings.defaultExportFormat,
          imageryStyle: settings.defaultImageryStyle,
          speakerNotes: settings.defaultSpeakerNotes,
          tone: settings.defaultTone,
        },
        theme: document.theme,
      },
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

  return ok(toPresentationSummary(presentation), 201);
}

type PresentationSummaryRecord = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  requestedSlideCount: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPresentationSummary(presentation: PresentationSummaryRecord) {
  return {
    id: presentation.id,
    projectId: presentation.projectId,
    title: presentation.title,
    status: presentation.status,
    requestedSlideCount: presentation.requestedSlideCount,
    archivedAt: presentation.archivedAt?.toISOString() ?? null,
    createdAt: presentation.createdAt.toISOString(),
    updatedAt: presentation.updatedAt.toISOString(),
    editorUrl: `/app/presentations/${encodeURIComponent(presentation.id)}/editor`,
  };
}

function createPresentationDocument({
  locale,
  ownerId,
  presentationId,
  slideCount,
  title,
}: {
  locale: string;
  ownerId: string;
  presentationId: string;
  slideCount: number;
  title: string;
}) {
  const now = new Date().toISOString();
  const base = createDemoPresentationDocument({ ownerId, now });
  const templateSlide = base.slides[0];

  return validatePresentation({
    ...base,
    id: presentationId,
    locale,
    title,
    metadata: {
      ...base.metadata,
      createdAt: now,
      updatedAt: now,
      ownerId,
    },
    slides: Array.from({ length: slideCount }, (_value, index) => {
      const slide = structuredClone(templateSlide);
      return {
        ...slide,
        id: randomUUID(),
        order: index + 1,
        title: index === 0 ? title : `${title} ${index + 1}`,
      };
    }),
  });
}
