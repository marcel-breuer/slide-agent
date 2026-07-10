import { prisma } from "@slide-agent/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { getAuthenticatedSession } from "@/lib/server-auth-session";

import { DELETE } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
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
const mockedDeleteSession = prisma.session.deleteMany as unknown as Mock;
const mockedCreateAuditLog = prisma.auditLog.create as unknown as Mock;

describe("security session revocation API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedSession.mockResolvedValue(authenticatedSession);
    mockedDeleteSession.mockResolvedValue({ count: 1 });
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedSession.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://test.local/api/settings/security/sessions/session-2", {
        body: JSON.stringify({ confirmation: "REVOKE_SESSION" }),
        method: "DELETE",
      }),
      { params: Promise.resolve({ sessionId: "session-2" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedDeleteSession).not.toHaveBeenCalled();
  });

  it("revokes only sessions owned by the authenticated user", async () => {
    const response = await DELETE(
      new Request("http://test.local/api/settings/security/sessions/session-2", {
        body: JSON.stringify({ confirmation: "REVOKE_SESSION" }),
        method: "DELETE",
      }),
      { params: Promise.resolve({ sessionId: "session-2" }) },
    );
    const payload = (await response.json()) as { data: { revoked: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.revoked).toBe(true);
    expect(mockedDeleteSession).toHaveBeenCalledWith({
      where: { id: "session-2", userId: "user-1" },
    });
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "security.session_revoked",
          userId: "user-1",
        }),
      }),
    );
  });

  it("requires explicit revocation confirmation", async () => {
    const response = await DELETE(
      new Request("http://test.local/api/settings/security/sessions/session-2", {
        body: JSON.stringify({ confirmation: "wrong" }),
        method: "DELETE",
      }),
      { params: Promise.resolve({ sessionId: "session-2" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedDeleteSession).not.toHaveBeenCalled();
  });

  it("does not reveal whether another user's session exists", async () => {
    mockedDeleteSession.mockResolvedValue({ count: 0 });

    const response = await DELETE(
      new Request("http://test.local/api/settings/security/sessions/session-other", {
        body: JSON.stringify({ confirmation: "REVOKE_SESSION" }),
        method: "DELETE",
      }),
      { params: Promise.resolve({ sessionId: "session-other" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("SESSION_NOT_FOUND");
    expect(mockedCreateAuditLog).not.toHaveBeenCalled();
  });
});
