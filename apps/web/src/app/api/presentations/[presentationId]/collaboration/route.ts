import { z } from "zod";

import { findPresentationDocument, prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "@/lib/billing";
import { getAuthenticatedUserId } from "@/lib/server-session";

const SESSION_TTL_MS = 30_000;

const CollaborationHeartbeatSchema = z.object({
  clientId: z.string().trim().min(16).max(120),
  knownUpdatedAt: z.string().datetime(),
  selectedSlideId: z.string().trim().min(1).max(120).nullable().optional(),
});

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { presentationId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = CollaborationHeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Collaboration heartbeat is invalid.", 400);
  }

  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId },
    select: { id: true, updatedAt: true },
  });
  if (!presentation) {
    return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
  }

  try {
    await assertBillingQuota(userId, "members", 0);
  } catch (error) {
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    throw error;
  }

  const now = new Date();
  const activeSince = new Date(now.getTime() - SESSION_TTL_MS);

  await prisma.presentationCollaboratorSession.deleteMany({
    where: { presentationId, lastSeenAt: { lt: activeSince } },
  });
  await prisma.presentationCollaboratorSession.upsert({
    where: {
      presentationId_userId_clientId: {
        clientId: parsed.data.clientId,
        presentationId,
        userId,
      },
    },
    update: {
      lastSeenAt: now,
      selectedSlideId: parsed.data.selectedSlideId ?? null,
    },
    create: {
      clientId: parsed.data.clientId,
      lastSeenAt: now,
      presentationId,
      selectedSlideId: parsed.data.selectedSlideId ?? null,
      userId,
    },
  });

  const sessions = await prisma.presentationCollaboratorSession.findMany({
    where: { presentationId, lastSeenAt: { gte: activeSince } },
    orderBy: [{ lastSeenAt: "desc" }],
    select: {
      clientId: true,
      id: true,
      lastSeenAt: true,
      selectedSlideId: true,
      user: { select: { displayName: true, email: true, id: true } },
    },
  });

  const currentUpdatedAt = presentation.updatedAt.toISOString();
  const document =
    parsed.data.knownUpdatedAt === currentUpdatedAt
      ? null
      : await findPresentationDocument(prisma, presentationId);

  return ok({
    collaborators: sessions.map((session) => ({
      clientId: session.clientId,
      displayName: session.user.displayName ?? session.user.email,
      id: session.id,
      lastSeenAt: session.lastSeenAt.toISOString(),
      selectedSlideId: session.selectedSlideId,
      userId: session.user.id,
    })),
    currentUpdatedAt,
    document,
  });
}
