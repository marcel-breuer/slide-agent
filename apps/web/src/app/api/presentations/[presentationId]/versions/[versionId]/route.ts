import { z } from "zod";

import {
  findPresentationDocument,
  prisma,
  type Prisma,
  savePresentationDocument,
} from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { createVersion } from "../route";
import { getAuthenticatedUserId } from "@/lib/server-session";

const RestoreSchema = z.object({
  action: z.literal("restore"),
  expectedUpdatedAt: z.string().datetime(),
});
type RouteContext = { params: Promise<{ presentationId: string; versionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { presentationId, versionId } = await context.params;

  const version = await prisma.presentationVersion.findFirst({
    where: { id: versionId, presentationId, presentation: { ownerId: userId } },
    include: { actor: { select: { displayName: true, email: true, id: true } } },
  });
  if (!version) return fail("VERSION_NOT_FOUND", "Presentation version was not found.", 404);
  const current = await findPresentationDocument(prisma, presentationId);
  return ok({ current, version });
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }
  const parsed = RestoreSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Restore input is invalid.", 400);
  const { presentationId, versionId } = await context.params;
  const version = await prisma.presentationVersion.findFirst({
    where: { id: versionId, presentationId, presentation: { ownerId: userId } },
    select: { document: true, version: true },
  });
  if (!version) return fail("VERSION_NOT_FOUND", "Presentation version was not found.", 404);

  try {
    const document = await savePresentationDocument(prisma, {
      document: version.document,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      ownerId: userId,
      presentationId,
    });
    const restoreVersion = await createVersion({
      actorId: userId,
      changeSummary: `Restored version ${version.version}`,
      document: document as unknown as Prisma.InputJsonValue,
      presentationId,
      source: "restore",
    });
    return ok({ document, version: restoreVersion });
  } catch (error) {
    if (error instanceof Error && error.name === "PresentationVersionConflictError") {
      return fail(
        "PRESENTATION_VERSION_CONFLICT",
        "Presentation changed since it was loaded.",
        409,
      );
    }
    return fail("RESTORE_FAILED", "Presentation version could not be restored.", 400);
  }
}
