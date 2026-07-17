import { prisma } from "@slide-agent/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { getAuthenticatedSession } from "@/lib/server-auth-session";

import { GET } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    aiOperation: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-auth-session", () => ({
  getAuthenticatedSession: vi.fn(),
}));

const mockedGetAuthenticatedSession = vi.mocked(getAuthenticatedSession);
const mockedFindUser = prisma.user.findUnique as unknown as Mock;
const mockedFindAuditLogs = prisma.auditLog.findMany as unknown as Mock;
const mockedFindAiOperations = prisma.aiOperation.findMany as unknown as Mock;

describe("account export API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedSession.mockResolvedValue({
      email: "user@example.com",
      role: "USER",
      sessionId: "session-current",
      userId: "user-1",
    });
    mockedFindUser.mockResolvedValue(createExportUser());
    mockedFindAuditLogs.mockResolvedValue([
      {
        action: "account.profile_updated",
        createdAt: new Date("2026-07-10T08:00:00.000Z"),
        id: "audit-1",
        metadata: {},
      },
    ]);
    mockedFindAiOperations.mockResolvedValue([
      {
        createdAt: new Date("2026-07-10T08:05:00.000Z"),
        estimatedCost: "1.25",
        id: "operation-1",
        inputTokens: 100,
        model: "gpt-4.1",
        outputTokens: 50,
        provider: "openai",
        status: "SUCCEEDED",
        taskType: "STORYLINE_GENERATION",
      },
    ]);
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedSession.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindUser).not.toHaveBeenCalled();
  });

  it("exports sanitized account-scoped data for the current user", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      providerCredentials: Array<{ maskedValue: string }>;
      projects: Array<{ presentations: Array<{ id: string }> }>;
      user: { email: string };
    };
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("slide-agent-account-export");
    expect(payload.user.email).toBe("user@example.com");
    expect(payload.providerCredentials[0]?.maskedValue).toBe("sk-••••••••••••1234");
    expect(payload.projects[0]?.presentations[0]?.id).toBe("presentation-1");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("tokenHash");
    expect(mockedFindUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(mockedFindAiOperations).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user-1" } }),
    );
  });
});

function createExportUser() {
  return {
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    credentials: [
      {
        enabled: true,
        maskedValue: "sk-••••••••••••1234",
        provider: "openai",
        updatedAt: new Date("2026-07-10T08:00:00.000Z"),
      },
    ],
    displayName: "Example User",
    email: "user@example.com",
    id: "user-1",
    projects: [
      {
        archivedAt: null,
        createdAt: new Date("2026-07-02T08:00:00.000Z"),
        description: null,
        id: "project-1",
        name: "Board",
        presentations: [
          {
            archivedAt: null,
            createdAt: new Date("2026-07-02T09:00:00.000Z"),
            id: "presentation-1",
            requestedSlideCount: 10,
            status: "EDITING",
            title: "Q3 Review",
            updatedAt: new Date("2026-07-02T10:00:00.000Z"),
          },
        ],
        updatedAt: new Date("2026-07-02T08:30:00.000Z"),
      },
    ],
    providerConfigurations: [
      {
        baseUrl: null,
        defaultModel: "gpt-4.1",
        enabled: true,
        provider: "openai",
        updatedAt: new Date("2026-07-10T08:00:00.000Z"),
      },
    ],
    settings: {
      defaultAudience: "business",
      defaultDetailLevel: "balanced",
      defaultExportCompatibility: "modern",
      defaultExportFormat: "pptx",
      defaultImageryStyle: "minimal",
      defaultSlideCount: 10,
      defaultSpeakerNotes: "talking-points",
      defaultTone: "professional",
      id: "settings-1",
      personalMaxSlideCount: 50,
      presentationLocale: "en",
      timeZone: "Europe/Berlin",
      uiLocale: "en",
      userId: "user-1",
    },
    updatedAt: new Date("2026-07-10T08:00:00.000Z"),
  };
}
