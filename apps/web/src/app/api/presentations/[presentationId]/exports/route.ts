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
