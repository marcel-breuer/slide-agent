import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

import { verifyPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { createUserSession } from "@/lib/server-auth-session";

import { POST } from "./route";

vi.mock("@slide-agent/auth", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@slide-agent/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-auth-session", () => ({
  createUserSession: vi.fn(),
}));

const mockedFindUser = prisma.user.findUnique as unknown as Mock;
const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedCreateUserSession = vi.mocked(createUserSession);

describe("login API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects invalid credentials without creating a session", async () => {
    mockedFindUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local/api/auth/login", {
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("INVALID_CREDENTIALS");
    expect(mockedCreateUserSession).not.toHaveBeenCalled();
  });

  it("creates a database-backed session cookie for valid credentials", async () => {
    mockedFindUser.mockResolvedValue({
      deletedAt: null,
      id: "user-1",
      passwordHash: "hash",
      suspendedAt: null,
    });
    mockedVerifyPassword.mockResolvedValue(true);
    mockedCreateUserSession.mockResolvedValue({
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
      sessionId: "session-1",
      token: "raw-session-token",
    });

    const response = await POST(
      new Request("http://test.local/api/auth/login", {
        body: JSON.stringify({
          email: "USER@example.com",
          next: "/app/projects",
          password: "StrongPassword!123",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { ok: boolean; data: { redirectTo: string } };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, data: { redirectTo: "/app/projects" } });
    expect(mockedFindUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "user@example.com" } }),
    );
    expect(mockedCreateUserSession).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("set-cookie")).toContain(
      "slide_agent_session=v1.raw-session-token.",
    );
  });

  it("rejects suspended users", async () => {
    mockedFindUser.mockResolvedValue({
      deletedAt: null,
      id: "user-1",
      passwordHash: "hash",
      suspendedAt: new Date("2026-07-09T10:00:00.000Z"),
    });
    mockedVerifyPassword.mockResolvedValue(true);

    const response = await POST(
      new Request("http://test.local/api/auth/login", {
        body: JSON.stringify({ email: "user@example.com", password: "StrongPassword!123" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mockedCreateUserSession).not.toHaveBeenCalled();
  });
});
