import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

import { hashPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";
import { logSafe } from "@/lib/safe-logger";

import { POST } from "./route";

vi.mock("@slide-agent/auth", () => ({
  hashPassword: vi.fn(),
}));

vi.mock("@slide-agent/database", () => ({
  prisma: {
    user: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/safe-logger", () => ({
  logSafe: vi.fn(),
}));

const mockedHashPassword = vi.mocked(hashPassword);
const mockedCreateUser = prisma.user.create as unknown as Mock;

describe("register API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedHashPassword.mockResolvedValue("hashed-password");
    mockedCreateUser.mockResolvedValue({ id: "user-1" });
  });

  it("creates a persisted user with settings", async () => {
    const response = await POST(
      new Request("http://test.local/api/auth/register", {
        body: JSON.stringify({
          displayName: "Example User",
          email: "USER@example.com",
          password: "StrongPassword!123",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data: { userId: string; verificationRequired: boolean };
    };

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      ok: true,
      data: { userId: "user-1", verificationRequired: true },
    });
    expect(mockedCreateUser).toHaveBeenCalledWith({
      data: {
        displayName: "Example User",
        email: "user@example.com",
        passwordHash: "hashed-password",
        settings: {
          create: {},
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("rejects weak passwords", async () => {
    mockedHashPassword.mockRejectedValue(new Error("weak"));

    const response = await POST(
      new Request("http://test.local/api/auth/register", {
        body: JSON.stringify({ email: "user@example.com", password: "weak" }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("WEAK_PASSWORD");
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("returns a conflict for duplicate email addresses", async () => {
    mockedCreateUser.mockRejectedValue({ code: "P2002" });

    const response = await POST(
      new Request("http://test.local/api/auth/register", {
        body: JSON.stringify({ email: "user@example.com", password: "StrongPassword!123" }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("returns a safe generic error when persistence fails unexpectedly", async () => {
    mockedCreateUser.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      new Request("http://test.local/api/auth/register", {
        body: JSON.stringify({ email: "user@example.com", password: "StrongPassword!123" }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(payload.error).toEqual({
      code: "REGISTRATION_FAILED",
      message: "Account could not be created.",
    });
    expect(logSafe).toHaveBeenCalledWith("error", "registration failed", {
      errorName: "Error",
      prismaCode: undefined,
    });
  });
});
