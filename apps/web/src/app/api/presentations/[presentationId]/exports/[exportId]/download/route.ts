import { ensureDemoPresentation, prisma } from "@slide-agent/database";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";

import { fail } from "../../../../../../../lib/api";
import {
  PPTX_MIME_TYPE,
  PresentationExportForbiddenError,
  PresentationExportNotFoundError,
  readPptxExportDownload,
} from "../../../../../../../lib/presentation-exports";
import { getAuthenticatedUserId } from "../../../../../../../lib/server-session";

type RouteContext = {
  params: Promise<{
    exportId: string;
    presentationId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { exportId, presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  try {
    const download = await readPptxExportDownload({
      client: prisma,
      exportId,
      presentationId,
      userId,
    });

    return new Response(toArrayBuffer(download.bytes), {
      headers: {
        "Content-Disposition": `attachment; filename="${escapeContentDispositionFileName(
          download.fileName,
        )}"`,
        "Content-Type": PPTX_MIME_TYPE,
      },
    });
  } catch (error) {
    if (error instanceof PresentationExportNotFoundError) {
      return fail("EXPORT_NOT_FOUND", "Presentation export was not found.", 404);
    }

    if (error instanceof PresentationExportForbiddenError) {
      return fail("FORBIDDEN", "Presentation export is not available for this user.", 403);
    }

    return fail("EXPORT_DOWNLOAD_FAILED", "Presentation export could not be downloaded.", 500);
  }
}

function escapeContentDispositionFileName(fileName: string): string {
  return fileName.replace(/["\\]/g, "_");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
