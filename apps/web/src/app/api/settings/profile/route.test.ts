import { prisma } from "@slide-agent/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { getAuthenticatedSession } from "@/lib/server-auth-session";

import { DELETE, GET, PATCH } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn(),
    },
    emailVerificationToken: {
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
    },
    providerCredential: {
      deleteMany: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-auth-session", () => ({
  getAuthenticatedSession: vi.fn(),
}));

const authenticatedSession = {
  email: "user@example.com",
  role: "USER" as const,
  sessionId: "session-current",
  userId: "user-1",
};

const mockedGetAuthenticatedSession = vi.mocked(getAuthenticatedSession);
const mockedFindUser = prisma.user.findUnique as unknown as Mock;
const mockedUpdateUser = prisma.user.update as unknown as Mock;
const mockedUpsertSettings = prisma.userSettings.upsert as unknown as Mock;
const mockedCreateAuditLog = prisma.auditLog.create as unknown as Mock;
const mockedDeleteSessions = prisma.session.deleteMany as unknown as Mock;
const mockedDeleteCredentials = prisma.providerCredential.deleteMany as unknown as Mock;
const mockedDeletePasswordTokens = prisma.passwordResetToken.deleteMany as unknown as Mock;
const mockedDeleteEmailTokens = prisma.emailVerificationToken.deleteMany as unknown as Mock;
const mockedTransaction = prisma.$transaction as unknown as Mock;

describe("profile settings API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedSession.mockResolvedValue(authenticatedSession);
    mockedFindUser.mockResolvedValue(createUser());
    mockedUpdateUser.mockResolvedValue(createUser({ displayName: "Updated User" }));
    mockedUpsertSettings.mockResolvedValue({});
    mockedCreateAuditLog.mockReturnValue({ kind: "audit" });
    mockedDeleteSessions.mockReturnValue({ kind: "sessions" });
    mockedDeleteCredentials.mockReturnValue({ kind: "credentials" });
    mockedDeletePasswordTokens.mockReturnValue({ kind: "password-tokens" });
    mockedDeleteEmailTokens.mockReturnValue({ kind: "email-tokens" });
    mockedTransaction.mockResolvedValue([]);
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedSession.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindUser).not.toHaveBeenCalled();
  });

  it("returns profile and regional preferences for the current user", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      data: { displayName: string; timeZone: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      displayName: "Example User",
      timeZone: "Europe/Berlin",
    });
    expect(mockedFindUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });

  it("updates display name and account preferences for the current user", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/profile", {
        body: JSON.stringify({
          displayName: " Updated User ",
          timeZone: "America/New_York",
        }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedUpdateUser).toHaveBeenCalledWith({
      data: { displayName: "Updated User" },
      where: { id: "user-1" },
    });
    expect(mockedUpsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          timeZone: "America/New_York",
          userId: "user-1",
        }),
        update: {
          timeZone: "America/New_York",
        },
        where: { userId: "user-1" },
      }),
    );
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "account.profile_updated",
          userId: "user-1",
        }),
      }),
    );
  });

  it("rejects invalid profile updates", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/profile", {
        body: JSON.stringify({ timeZone: "" }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedUpdateUser).not.toHaveBeenCalled();
  });

  it("soft deletes the signed-in account after email confirmation", async () => {
    const response = await DELETE(
      new Request("http://test.local/api/settings/profile", {
        body: JSON.stringify({
          confirmation: "DELETE_ACCOUNT",
          email: "user@example.com",
        }),
        method: "DELETE",
      }),
    );
    const payload = (await response.json()) as { data: { deleted: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.deleted).toBe(true);
    expect(mockedDeleteSessions).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockedDeleteCredentials).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockedUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          displayName: null,
          email: "deleted-user-1@deleted.slide-agent.local",
        }),
        where: { id: "user-1" },
      }),
    );
    expect(mockedTransaction).toHaveBeenCalled();
  });

  it("rejects account deletion without matching email confirmation", async () => {
    const response = await DELETE(
      new Request("http://test.local/api/settings/profile", {
        body: JSON.stringify({
          confirmation: "DELETE_ACCOUNT",
          email: "other@example.com",
        }),
        method: "DELETE",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});

function createUser(overrides = {}) {
  return {
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    displayName: "Example User",
    email: "user@example.com",
    id: "user-1",
    settings: {
      timeZone: "Europe/Berlin",
    },
    updatedAt: new Date("2026-07-10T08:00:00.000Z"),
    ...overrides,
  };
}
