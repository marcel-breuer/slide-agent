import { ensureDemoPresentation, prisma } from "@slide-agent/database";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";

import { fail, ok } from "../../../../../lib/api";
import {
  createPptxExport,
  PresentationExportFailedError,
  PresentationExportForbiddenError,
  PresentationExportNotFoundError,
} from "../../../../../lib/presentation-exports";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  try {
    const exportSummary = await createPptxExport({
      client: prisma,
      presentationId,
      userId,
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
    where: { id: presentationId, ownerId: userId },
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
        createdAt: exportRecord.createdAt.toISOString(),
        downloadUrl: `/api/presentations/${encodeURIComponent(
          presentationId,
        )}/exports/${encodeURIComponent(exportRecord.id)}/download`,
      };
    }),
  );
}
