import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { POST } from "./route";

vi.mock("@slide-agent/auth", () => ({ hashPassword: vi.fn() }));
vi.mock("@slide-agent/database", () => ({
  prisma: {
    passwordResetToken: { findUnique: vi.fn(), update: vi.fn() },
    user: { updateMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/password-reset", () => ({
  hashPasswordResetToken: vi.fn(() => "hashed-reset-token"),
}));

const mockedHashPassword = vi.mocked(hashPassword);
const mockedFindToken = prisma.passwordResetToken.findUnique as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedTransaction = prisma.$transaction as unknown as {
  mockResolvedValue(value: unknown): void;
};

describe("reset password API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedHashPassword.mockResolvedValue("new-password-hash");
    mockedFindToken.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      id: "reset-1",
      tokenHash: "hashed-reset-token",
      usedAt: null,
      userId: "user-1",
    });
    mockedTransaction.mockResolvedValue([]);
  });

  it("updates the password and invalidates existing sessions", async () => {
    const response = await POST(
      new Request("http://test.local/api/auth/reset-password", {
        body: JSON.stringify({ password: "StrongPassword!123", token: "raw-reset-token" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedHashPassword).toHaveBeenCalledWith("StrongPassword!123");
    expect(mockedTransaction).toHaveBeenCalled();
  });

  it("rejects an expired or already used token", async () => {
    mockedFindToken.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      id: "reset-1",
      tokenHash: "hashed-reset-token",
      usedAt: null,
      userId: "user-1",
    });

    const response = await POST(
      new Request("http://test.local/api/auth/reset-password", {
        body: JSON.stringify({ password: "StrongPassword!123", token: "raw-reset-token" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});
