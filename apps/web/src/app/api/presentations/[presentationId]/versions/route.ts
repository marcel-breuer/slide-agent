import { z } from "zod";

import { prisma, type Prisma } from "@slide-agent/database";
import { findPresentationDocument } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { sanitizeCommentBody } from "@/lib/presentation-comments";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { activePresentationScope, canAccess, getPresentationAccess } from "@/lib/team-access";

const VersionInputSchema = z.object({
  changeSummary: z.string().trim().max(240).optional(),
  source: z.string().trim().min(1).max(80).default("manual"),
});

type RouteContext = { params: Promise<{ presentationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  const { presentationId } = await context.params;

  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const versions = await prisma.presentationVersion.findMany({
    where: { presentationId },
    orderBy: { version: "desc" },
    select: {
      actor: { select: { displayName: true, email: true, id: true } },
      changeSummary: true,
      createdAt: true,
      id: true,
      source: true,
      version: true,
    },
  });

  return ok({
    presentationId,
    versions: versions.map((version) => ({
      actor: version.actor
        ? { displayName: version.actor.displayName ?? version.actor.email, id: version.actor.id }
        : null,
      changeSummary: version.changeSummary,
      createdAt: version.createdAt.toISOString(),
      id: version.id,
      source: version.source,
      version: version.version,
    })),
  });
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
  const parsed = VersionInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Version input is invalid.", 400);

  const { presentationId } = await context.params;
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ...activePresentationScope(userId) },
    select: { id: true },
  });
  if (!presentation) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }

  const document = await findPresentationDocument(prisma, presentationId);
  if (!document) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  const version = await createVersion({
    actorId: userId,
    document,
    presentationId,
    source: parsed.data.source,
    ...(parsed.data.changeSummary ? { changeSummary: parsed.data.changeSummary } : {}),
  });
  return ok(serializeVersion(version), 201);
}

export async function createVersion({
  actorId,
  changeSummary,
  document,
  presentationId,
  source,
}: {
  actorId: string;
  changeSummary?: string;
  document: Prisma.InputJsonValue;
  presentationId: string;
  source: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const latest = await transaction.presentationVersion.findFirst({
      where: { presentationId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return transaction.presentationVersion.create({
      data: {
        actorId,
        changeSummary: changeSummary ? sanitizeCommentBody(changeSummary) : null,
        document,
        presentationId,
        source,
        version: (latest?.version ?? 0) + 1,
      },
      include: { actor: { select: { displayName: true, email: true, id: true } } },
    });
  });
}

function serializeVersion(version: {
  actor: { displayName: string | null; email: string; id: string } | null;
  changeSummary: string | null;
  createdAt: Date;
  document?: unknown;
  id: string;
  source: string;
  version: number;
}) {
  return {
    actor: version.actor
      ? { displayName: version.actor.displayName ?? version.actor.email, id: version.actor.id }
      : null,
    changeSummary: version.changeSummary,
    createdAt: version.createdAt.toISOString(),
    document: version.document,
    id: version.id,
    source: version.source,
    version: version.version,
  };
}
