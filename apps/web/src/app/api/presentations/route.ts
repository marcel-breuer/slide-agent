/* global structuredClone */

import { randomUUID } from "node:crypto";

import { prisma, type Prisma } from "@slide-agent/database";
import { enforceSlideLimit } from "@slide-agent/presentation-schema";
import {
  createDemoPresentationDocument,
  validatePresentation,
} from "@slide-agent/presentation-schema";

import { ReusableAssetDefinitionSchema, PresentationInputSchema, fail, ok } from "@/lib/api";
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "@/lib/billing";
import type { ReusableAssetDefinition } from "@/lib/reusable-assets";
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

  try {
    await assertBillingQuota(userId, "presentations");
  } catch (error) {
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    throw error;
  }

  const designProfile = parsed.data.designProfileId
    ? await prisma.designProfile.findFirst({
        where: { id: parsed.data.designProfileId, ownerId: userId, archivedAt: null },
        select: {
          id: true,
          name: true,
          versions: {
            orderBy: { version: "desc" },
            select: { profile: true, version: true },
            take: 1,
          },
        },
      })
    : null;
  if (parsed.data.designProfileId && !designProfile) {
    return fail("DESIGN_PROFILE_NOT_FOUND", "Design profile was not found.", 404);
  }

  const reusableAsset = parsed.data.reusableAssetId
    ? await prisma.reusableAsset.findFirst({
        where: { id: parsed.data.reusableAssetId, ownerId: userId, archivedAt: null },
        select: {
          id: true,
          name: true,
          kind: true,
          versions: {
            orderBy: { version: "desc" },
            select: { definition: true, version: true },
            take: 1,
          },
        },
      })
    : null;
  if (parsed.data.reusableAssetId && !reusableAsset) {
    return fail("REUSABLE_ASSET_NOT_FOUND", "Template was not found.", 404);
  }

  const reusableAssetDefinition = reusableAsset?.versions[0]
    ? ReusableAssetDefinitionSchema.parse(reusableAsset.versions[0].definition)
    : undefined;

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
    ...(reusableAssetDefinition ? { reusableAssetDefinition } : {}),
  });

  const presentation = await prisma.presentation.create({
    data: {
      id: document.id,
      ownerId: userId,
      projectId: project.id,
      designProfileId: designProfile?.id ?? null,
      reusableAssetId: reusableAsset?.id ?? null,
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
        designProfile: designProfile
          ? {
              id: designProfile.id,
              name: designProfile.name,
              profile: designProfile.versions[0]?.profile ?? null,
              version: designProfile.versions[0]?.version ?? null,
            }
          : null,
        reusableAsset: reusableAsset
          ? {
              id: reusableAsset.id,
              kind: reusableAsset.kind,
              name: reusableAsset.name,
              version: reusableAsset.versions[0]?.version ?? null,
            }
          : null,
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
  reusableAssetDefinition,
  slideCount,
  title,
}: {
  locale: string;
  ownerId: string;
  presentationId: string;
  reusableAssetDefinition?: ReusableAssetDefinition;
  slideCount: number;
  title: string;
}) {
  const now = new Date().toISOString();
  const base = createDemoPresentationDocument({ ownerId, now });
  const templateSlides = reusableAssetDefinition?.slides.length
    ? reusableAssetDefinition.slides
    : base.slides;
  const profileColors = Object.fromEntries(
    reusableAssetDefinition?.profile.colors.map((color) => [color.role, color.hex]) ?? [],
  );
  const headingFont = reusableAssetDefinition?.profile.fonts.find((font) =>
    font.role.toLowerCase().includes("heading"),
  )?.family;
  const bodyFont = reusableAssetDefinition?.profile.fonts.find((font) =>
    font.role.toLowerCase().includes("body"),
  )?.family;

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
    theme: {
      colors: { ...base.theme.colors, ...profileColors },
      fonts: {
        body: bodyFont ?? base.theme.fonts.body,
        heading: headingFont ?? base.theme.fonts.heading,
      },
    },
    slides: Array.from({ length: slideCount }, (_value, index) => {
      const slide = structuredClone(
        templateSlides[index % templateSlides.length] ?? base.slides[0],
      );
      return {
        ...slide,
        id: randomUUID(),
        order: index + 1,
        title: index === 0 ? title : `${title} ${index + 1}`,
      };
    }),
  });
}
