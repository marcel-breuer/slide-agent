import { randomUUID } from "node:crypto";

import { ensureDemoPresentation, findPresentationDocument, prisma } from "@slide-agent/database";
import { exportPresentation } from "@slide-agent/pptx-exporter";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";
import { createLocalObjectStorageFromEnv } from "@slide-agent/storage";

import { fail, ok } from "../../../../../lib/api";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function POST(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const document = await findPresentationDocument(prisma, presentationId);
  if (!document) {
    return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  }

  if (document.metadata.ownerId !== userId) {
    return fail("FORBIDDEN", "You do not have access to this presentation.", 403);
  }

  try {
    const exportId = randomUUID();
    const storageKey = `exports/${userId}/${presentationId}/${exportId}.pptx`;
    const { buffer, report } = await exportPresentation(document);
    const storage = createLocalObjectStorageFromEnv(process.env);

    await storage.putObject({
      bytes: buffer,
      key: storageKey,
      mimeType: PPTX_MIME_TYPE,
    });

    await prisma.$transaction(async (transaction) => {
      const exportRecord = await transaction.export.create({
        data: {
          id: exportId,
          ownerId: userId,
          presentationId,
          report,
          storageKey,
        },
      });

      await transaction.presentation.update({
        where: { id: presentationId },
        data: {
          lastExportAt: exportRecord.createdAt,
          status: "COMPLETED",
        },
      });

      return exportRecord;
    });

    return ok(
      {
        downloadUrl: `/api/presentations/${encodeURIComponent(
          presentationId,
        )}/exports/${encodeURIComponent(exportId)}`,
        exportId,
        fileName: `${safeFileName(document.title)}.pptx`,
        mimeType: PPTX_MIME_TYPE,
        report,
      },
      201,
    );
  } catch {
    return fail("EXPORT_FAILED", "Presentation export could not be created.", 500);
  }
}

function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  return normalized || "presentation";
}
