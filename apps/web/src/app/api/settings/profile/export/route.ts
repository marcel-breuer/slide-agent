import { prisma } from "@slide-agent/database";

import { fail } from "@/lib/api";
import { getAuthenticatedSession } from "@/lib/server-auth-session";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const user = await prisma.user.findUnique({
    select: {
      createdAt: true,
      displayName: true,
      email: true,
      id: true,
      providerConfigurations: {
        orderBy: { provider: "asc" },
        select: {
          baseUrl: true,
          defaultModel: true,
          enabled: true,
          provider: true,
          updatedAt: true,
        },
      },
      credentials: {
        orderBy: { provider: "asc" },
        select: {
          enabled: true,
          maskedValue: true,
          provider: true,
          updatedAt: true,
        },
      },
      projects: {
        orderBy: { createdAt: "desc" },
        select: {
          archivedAt: true,
          createdAt: true,
          description: true,
          id: true,
          name: true,
          presentations: {
            orderBy: { createdAt: "desc" },
            select: {
              archivedAt: true,
              createdAt: true,
              id: true,
              requestedSlideCount: true,
              status: true,
              title: true,
              updatedAt: true,
            },
          },
          updatedAt: true,
        },
      },
      settings: true,
      updatedAt: true,
    },
    where: { id: session.userId },
  });

  if (!user) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const [auditLogs, aiOperations] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        createdAt: true,
        id: true,
        metadata: true,
      },
      take: 100,
      where: { userId: session.userId },
    }),
    prisma.aiOperation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        estimatedCost: true,
        id: true,
        inputTokens: true,
        model: true,
        outputTokens: true,
        provider: true,
        status: true,
        taskType: true,
      },
      take: 100,
      where: { ownerId: session.userId },
    }),
  ]);

  const exportPayload = {
    aiOperations: aiOperations.map((operation) => ({
      ...operation,
      createdAt: operation.createdAt.toISOString(),
      estimatedCost: Number(operation.estimatedCost),
    })),
    auditLogs: auditLogs.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    providerConfigurations: user.providerConfigurations.map((configuration) => ({
      ...configuration,
      updatedAt: configuration.updatedAt.toISOString(),
    })),
    providerCredentials: user.credentials.map((credential) => ({
      ...credential,
      updatedAt: credential.updatedAt.toISOString(),
    })),
    projects: user.projects.map((project) => ({
      ...project,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      presentations: project.presentations.map((presentation) => ({
        ...presentation,
        archivedAt: presentation.archivedAt?.toISOString() ?? null,
        createdAt: presentation.createdAt.toISOString(),
        updatedAt: presentation.updatedAt.toISOString(),
      })),
      updatedAt: project.updatedAt.toISOString(),
    })),
    settings: user.settings,
    user: {
      createdAt: user.createdAt.toISOString(),
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      updatedAt: user.updatedAt.toISOString(),
    },
  };

  return Response.json(exportPayload, {
    headers: {
      "Content-Disposition": `attachment; filename="slide-agent-account-export-${session.userId}.json"`,
      "Content-Type": "application/json",
    },
  });
}
