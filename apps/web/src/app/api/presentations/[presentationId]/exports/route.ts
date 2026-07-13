import { ensureDemoPresentation, prisma } from "@slide-agent/database";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";
import { z } from "zod";

import { fail, ok } from "../../../../../lib/api";
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "../../../../../lib/billing";
import {
  createPptxExport,
  DEFAULT_PRESENTATION_EXPORT_SETTINGS,
  type PresentationExportSettings,
  PresentationExportFailedError,
  PresentationExportForbiddenError,
  PresentationExportNotFoundError,
} from "../../../../../lib/presentation-exports";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "../../../../../lib/team-access";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const ExportSettingsSchema = z
  .object({
    compatibility: z.enum(["legacy", "modern", "strict"]).default("modern"),
    format: z.literal("pptx").default("pptx"),
    imageFallbackMode: z
      .enum(["preserve-editable", "rasterize-unsupported"])
      .default("preserve-editable"),
    includeSpeakerNotes: z.boolean().default(true),
  })
  .default(DEFAULT_PRESENTATION_EXPORT_SETTINGS);

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const settings = await parseExportSettings(request);
  if (!settings.ok) {
    return fail("INVALID_EXPORT_SETTINGS", settings.message, 400);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const access = await getPresentationAccess(presentationId, userId);
  if (!canAccess(access, "edit")) return fail("FORBIDDEN", "You cannot export this presentation.", 403);

  try {
    await assertBillingQuota(userId, "exports");
  } catch (error) {
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    throw error;
  }

  try {
    const exportSummary = await createPptxExport({
      client: prisma,
      presentationId,
      settings: settings.data,
      userId,
      ...(access?.teamId ? { allowSharedAccess: true } : {}),
    });

    return ok(exportSummary, 201);
  } catch (error) {
    if (error instanceof PresentationExportNotFoundError) {
      return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
    }

    if (error instanceof PresentationExportForbiddenError) {
      return fail("FORBIDDEN", "Presentation is not available for this user.", 403);
    }

    if (error instanceof PresentationExportFailedError) {
      return fail("EXPORT_FAILED", error.message, 500);
    }

    return fail("EXPORT_FAILED", "Presentation export could not be created.", 500);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: {
      id: true,
      title: true,
      exports: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          report: true,
          createdAt: true,
        },
      },
    },
  });

  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  return ok(
    presentation.exports.map((exportRecord) => {
      const report =
        exportRecord.report !== null &&
        typeof exportRecord.report === "object" &&
        !Array.isArray(exportRecord.report)
          ? (exportRecord.report as Record<string, unknown>)
          : {};

      return {
        id: exportRecord.id,
        presentationId,
        fileName:
          typeof report.fileName === "string" ? report.fileName : `${presentation.title}.pptx`,
        byteSize: typeof report.byteSize === "number" ? report.byteSize : null,
        slideCount: typeof report.slideCount === "number" ? report.slideCount : null,
        settings: parseStoredSettings(report.settings),
        warnings: Array.isArray(report.warnings)
          ? report.warnings.filter((warning): warning is string => typeof warning === "string")
          : [],
        createdAt: exportRecord.createdAt.toISOString(),
        downloadUrl: `/api/presentations/${encodeURIComponent(
          presentationId,
        )}/exports/${encodeURIComponent(exportRecord.id)}/download`,
      };
    }),
  );
}

async function parseExportSettings(
  request: Request,
): Promise<{ ok: true; data: PresentationExportSettings } | { ok: false; message: string }> {
  const text = await request.text();
  if (!text.trim()) {
    return { ok: true, data: DEFAULT_PRESENTATION_EXPORT_SETTINGS };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: "Export settings must be valid JSON." };
  }

  const parsed = ExportSettingsSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, message: "Export settings are invalid." };
  }

  return { ok: true, data: parsed.data };
}

function parseStoredSettings(value: unknown): PresentationExportSettings | null {
  const parsed = ExportSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
