import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createDemoPresentationDocument,
  DEMO_PRESENTATION_ID,
  DEMO_PRESENTATION_TITLE,
  migratePresentationDocument,
  PRESENTATION_SCHEMA_VERSION,
  SLIDE_FORMAT,
  validatePresentation,
  type Locale,
  type PresentationDocument
} from "@slide-agent/presentation-schema";

export const DEMO_USER_EMAIL = "demo@slide-agent.local";
export const DEMO_USER_ID = "demo-user";
export const DEMO_PROJECT_ID = "project-demo";

type PresentationRecord = {
  id: string;
  ownerId: string;
  title: string;
  format: string;
  outputLanguage: string;
  designContext: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  slides: Array<{
    id: string;
    order: number;
    document: Prisma.JsonValue;
  }>;
};

export type PresentationLookupClient = {
  presentation: {
    findUnique(args: {
      where: { id: string };
      include: { slides: { orderBy: { order: "asc" } } };
    }): Promise<PresentationRecord | null>;
  };
};

type PresentationMutationClient = PresentationLookupClient & {
  presentation: PresentationLookupClient["presentation"] & {
    updateMany(args: {
      where: { id: string; updatedAt: Date };
      data: {
        title: string;
        format: string;
        outputLanguage: string;
        designContext: Prisma.InputJsonValue;
      };
    }): Promise<{ count: number }>;
  };
  slide: {
    deleteMany(args: { where: { presentationId: string } }): Promise<unknown>;
    createMany(args: {
      data: Array<{
        id: string;
        presentationId: string;
        order: number;
        document: Prisma.InputJsonValue;
      }>;
    }): Promise<unknown>;
  };
};

export type PresentationSaveClient = PresentationMutationClient & {
  $transaction<T>(callback: (client: PresentationMutationClient) => Promise<T>): Promise<T>;
};

export class PresentationNotFoundError extends Error {
  constructor(presentationId: string) {
    super(`Presentation not found: ${presentationId}`);
    this.name = "PresentationNotFoundError";
  }
}

export class PresentationVersionConflictError extends Error {
  constructor(presentationId: string) {
    super(`Presentation version conflict: ${presentationId}`);
    this.name = "PresentationVersionConflictError";
  }
}

export async function findPresentationDocument(
  client: PresentationLookupClient,
  presentationId: string
): Promise<PresentationDocument | null> {
  const presentation = await client.presentation.findUnique({
    where: { id: presentationId },
    include: { slides: { orderBy: { order: "asc" } } }
  });

  if (!presentation) return null;
  return buildPresentationDocument(presentation);
}

export async function savePresentationDocument(
  client: PresentationSaveClient,
  {
    presentationId,
    expectedUpdatedAt,
    document
  }: {
    presentationId: string;
    expectedUpdatedAt: string;
    document: unknown;
  }
): Promise<PresentationDocument> {
  const nextDocument = migratePresentationDocument(document);
  if (nextDocument.id !== presentationId) {
    throw new Error("Presentation document id does not match the route id.");
  }

  const expectedUpdatedAtDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAtDate.getTime())) {
    throw new Error("Expected updatedAt must be a valid datetime.");
  }

  return client.$transaction(async (transaction) => {
    const existing = await transaction.presentation.findUnique({
      where: { id: presentationId },
      include: { slides: { orderBy: { order: "asc" } } }
    });

    if (!existing) {
      throw new PresentationNotFoundError(presentationId);
    }

    const updateResult = await transaction.presentation.updateMany({
      where: { id: presentationId, updatedAt: expectedUpdatedAtDate },
      data: {
        title: nextDocument.title,
        format: nextDocument.format,
        outputLanguage: nextDocument.locale,
        designContext: { theme: nextDocument.theme }
      }
    });

    if (updateResult.count !== 1) {
      throw new PresentationVersionConflictError(presentationId);
    }

    await transaction.slide.deleteMany({ where: { presentationId } });
    await transaction.slide.createMany({
      data: nextDocument.slides.map((slide) => ({
        id: slide.id,
        presentationId,
        order: slide.order,
        document: slide
      }))
    });

    const saved = await transaction.presentation.findUnique({
      where: { id: presentationId },
      include: { slides: { orderBy: { order: "asc" } } }
    });

    if (!saved) {
      throw new PresentationNotFoundError(presentationId);
    }

    return buildPresentationDocument(saved);
  });
}

export function buildPresentationDocument(presentation: PresentationRecord): PresentationDocument {
  const fallbackTheme = createDemoPresentationDocument({ ownerId: presentation.ownerId }).theme;
  const designContext = asRecord(presentation.designContext);
  const theme = asRecord(designContext?.theme) ?? fallbackTheme;

  return validatePresentation({
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    id: presentation.id,
    title: presentation.title,
    locale: toLocale(presentation.outputLanguage),
    format: presentation.format === SLIDE_FORMAT ? presentation.format : SLIDE_FORMAT,
    theme,
    metadata: {
      createdAt: presentation.createdAt.toISOString(),
      updatedAt: presentation.updatedAt.toISOString(),
      ownerId: presentation.ownerId
    },
    slides: presentation.slides.map((slide) => {
      const document = asRecord(slide.document) ?? {};
      return {
        ...document,
        id: typeof document.id === "string" ? document.id : slide.id,
        order: slide.order
      };
    })
  });
}

export async function ensureDemoPresentation(client: PrismaClient): Promise<string> {
  const existing = await client.presentation.findUnique({
    where: { id: DEMO_PRESENTATION_ID },
    select: { id: true }
  });

  if (existing) return existing.id;

  const document = createDemoPresentationDocument({ ownerId: DEMO_USER_ID });
  const user = await client.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {
      displayName: "Demo User"
    },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      passwordHash: "demo-login-placeholder",
      displayName: "Demo User"
    }
  });

  const project = await client.project.upsert({
    where: { id: DEMO_PROJECT_ID },
    update: {
      ownerId: user.id,
      name: "Board reporting"
    },
    create: {
      id: DEMO_PROJECT_ID,
      ownerId: user.id,
      name: "Board reporting",
      description: "Demo project for local editor development."
    }
  });

  await client.presentation.create({
    data: {
      id: DEMO_PRESENTATION_ID,
      ownerId: user.id,
      projectId: project.id,
      title: DEMO_PRESENTATION_TITLE,
      status: "EDITING",
      requestedSlideCount: document.slides.length,
      format: document.format,
      outputLanguage: document.locale,
      designContext: { theme: document.theme },
      slides: {
        create: document.slides.map((slide) => ({
          id: slide.id,
          order: slide.order,
          document: slide
        }))
      }
    }
  });

  return DEMO_PRESENTATION_ID;
}

function toLocale(value: string): Locale {
  return value === "de" ? "de" : "en";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
