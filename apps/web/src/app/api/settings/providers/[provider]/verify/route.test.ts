import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { encryptCredential } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    providerConfiguration: {
      findFirst: vi.fn(),
    },
    providerCredential: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedConfigurationFindFirst = prisma.providerConfiguration.findFirst as unknown as Mock;
const mockedCredentialFindUnique = prisma.providerCredential.findUnique as unknown as Mock;

describe("provider credential verification API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CREDENTIAL_ENCRYPTION_KEY = "local-dev-encryption-key";
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    const encrypted = encryptCredential("sk-test-secret-AB12", "local-dev-encryption-key");
    mockedCredentialFindUnique.mockResolvedValue({
      authTag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      createdAt: new Date("2026-07-09T12:00:00.000Z"),
      enabled: true,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      nonce: encrypted.nonce,
    });
    mockedConfigurationFindFirst.mockResolvedValue({
      baseUrl: null,
      enabled: true,
      provider: "openai",
      userId: "user-1",
    });
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ provider: "openai" }),
    });
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedCredentialFindUnique).not.toHaveBeenCalled();
  });

  it("verifies the signed-in user's stored credential without returning plaintext", async () => {
    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ provider: "openai" }),
    });
    const payload = (await response.json()) as {
      data: { maskedIdentifier: string | null; valid: boolean };
    };
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.data.valid).toBe(true);
    expect(payload.data.maskedIdentifier).toBe("sk-••••AB12");
    expect(serialized).not.toContain("sk-test-secret-AB12");
    expect(mockedCredentialFindUnique).toHaveBeenCalledWith({
      where: { userId_provider: { userId: "user-1", provider: "openai" } },
    });
    expect(mockedConfigurationFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "openai", enabled: true },
    });
  });
});
