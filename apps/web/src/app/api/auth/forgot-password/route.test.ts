import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@slide-agent/database";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/password-reset", () => ({
  createPasswordResetToken: vi.fn(() => "raw-reset-token"),
  hashPasswordResetToken: vi.fn(() => "hashed-reset-token"),
  PASSWORD_RESET_TTL_MS: 60 * 60 * 1000,
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("@/lib/safe-logger", () => ({ logSafe: vi.fn() }));

const mockedFindUser = prisma.user.findUnique as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedDeleteTokens = prisma.passwordResetToken.deleteMany as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedCreateToken = prisma.passwordResetToken.create as unknown as {
  mockResolvedValue(value: unknown): void;
};

describe("forgot password API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFindUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockedDeleteTokens.mockResolvedValue({ count: 0 });
    mockedCreateToken.mockResolvedValue({ id: "reset-1" });
  });

  it("creates a hashed expiring token and sends the reset link", async () => {
    const response = await POST(
      new Request("http://test.local/api/auth/forgot-password", {
        body: JSON.stringify({ email: "USER@example.com" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedDeleteTokens).toHaveBeenCalledWith({ where: { userId: "user-1", usedAt: null } });
    expect(mockedCreateToken).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: "hashed-reset-token",
        userId: "user-1",
      }),
    });
  });

  it("does not reveal whether an email address exists", async () => {
    mockedFindUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local/api/auth/forgot-password", {
        body: JSON.stringify({ email: "unknown@example.com" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedCreateToken).not.toHaveBeenCalled();
  });
});
