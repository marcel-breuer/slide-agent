import { ensureDemoPresentation, prisma } from "@slide-agent/database";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";
import { createLocalObjectStorageFromEnv } from "@slide-agent/storage";

import { fail } from "../../../../../../lib/api";
import { getAuthenticatedUserId } from "../../../../../../lib/server-session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    exportId: string;
    presentationId: string;
  }>;
};

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { exportId, presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const exportRecord = await prisma.export.findFirst({
    where: {
      id: exportId,
      ownerId: userId,
      presentationId,
    },
    include: {
      presentation: {
        select: {
          title: true,
        },
      },
    },
  });

  if (!exportRecord) {
    return fail("EXPORT_NOT_FOUND", "Export was not found.", 404);
  }

  try {
    const storage = createLocalObjectStorageFromEnv(process.env);
    const bytes = await storage.readObject({ key: exportRecord.storageKey });
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const fileName = `${safeFileName(exportRecord.presentation.title)}.pptx`;

    return new Response(body as ArrayBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": PPTX_MIME_TYPE,
      },
    });
  } catch {
    return fail("EXPORT_FILE_MISSING", "Export file could not be read.", 410);
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
