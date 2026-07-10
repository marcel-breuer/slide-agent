import { hashPassword, verifyPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { getAuthenticatedSession } from "@/lib/server-auth-session";

import { GET, PATCH } from "./route";

vi.mock("@slide-agent/auth", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@slide-agent/database", () => ({
  prisma: {
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
const mockedHashPassword = vi.mocked(hashPassword);
const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedFindSessions = prisma.session.findMany as unknown as Mock;
const mockedFindAuditLogs = prisma.auditLog.findMany as unknown as Mock;
const mockedFindUser = prisma.user.findUnique as unknown as Mock;
const mockedUpdateUser = prisma.user.update as unknown as Mock;
const mockedCreateAuditLog = prisma.auditLog.create as unknown as Mock;
const mockedTransaction = prisma.$transaction as unknown as Mock;

describe("security settings API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedSession.mockResolvedValue(authenticatedSession);
    mockedFindSessions.mockResolvedValue([
      {
        createdAt: new Date("2026-07-10T07:00:00.000Z"),
        expiresAt: new Date("2026-07-17T07:00:00.000Z"),
        id: "session-current",
        rotatedAt: null,
      },
    ]);
    mockedFindAuditLogs.mockResolvedValue([
      {
        action: "security.password_changed",
        createdAt: new Date("2026-07-10T07:30:00.000Z"),
        id: "audit-1",
        metadata: { sessionId: "session-current" },
      },
    ]);
    mockedFindUser.mockResolvedValue({ passwordHash: "old-hash" });
    mockedVerifyPassword.mockResolvedValue(true);
    mockedHashPassword.mockResolvedValue("new-hash");
    mockedUpdateUser.mockReturnValue({ kind: "update-user" });
    mockedCreateAuditLog.mockReturnValue({ kind: "create-audit" });
    mockedTransaction.mockResolvedValue([]);
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedSession.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindSessions).not.toHaveBeenCalled();
  });

  it("returns sanitized sessions and audit events for the current user", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      data: {
        auditEvents: Array<{ action: string }>;
        sessions: Array<{ current: boolean; id: string }>;
      };
    };
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.data.sessions[0]).toMatchObject({ current: true, id: "session-current" });
    expect(payload.data.auditEvents[0]?.action).toBe("security.password_changed");
    expect(serialized).not.toContain("tokenHash");
    expect(mockedFindSessions).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(mockedFindAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });

  it("changes the password after current password and confirmation validation", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/security", {
        body: JSON.stringify({
          confirmation: "CHANGE_PASSWORD",
          currentPassword: "CurrentPassword!123",
          newPassword: "NewPassword!123",
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { data: { updated: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.updated).toBe(true);
    expect(mockedVerifyPassword).toHaveBeenCalledWith("CurrentPassword!123", "old-hash");
    expect(mockedHashPassword).toHaveBeenCalledWith("NewPassword!123");
    expect(mockedUpdateUser).toHaveBeenCalledWith({
      data: { passwordHash: "new-hash" },
      where: { id: "user-1" },
    });
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "security.password_changed",
          userId: "user-1",
        }),
      }),
    );
  });

  it("rejects password changes without explicit confirmation", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/security", {
        body: JSON.stringify({
          confirmation: "wrong",
          currentPassword: "CurrentPassword!123",
          newPassword: "NewPassword!123",
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects password changes when the current password is incorrect", async () => {
    mockedVerifyPassword.mockResolvedValue(false);

    const response = await PATCH(
      new Request("http://test.local/api/settings/security", {
        body: JSON.stringify({
          confirmation: "CHANGE_PASSWORD",
          currentPassword: "WrongPassword!123",
          newPassword: "NewPassword!123",
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_PASSWORD");
    expect(mockedHashPassword).not.toHaveBeenCalled();
  });
});
