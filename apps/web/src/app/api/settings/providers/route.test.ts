import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    providerConfiguration: {
      findMany: vi.fn(),
    },
    providerCredential: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedCredentialFindMany = prisma.providerCredential.findMany as unknown as Mock;
const mockedConfigurationFindMany = prisma.providerConfiguration.findMany as unknown as Mock;

describe("provider settings list API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedCredentialFindMany.mockResolvedValue([
      {
        enabled: true,
        maskedValue: "sk-••••••••••••1234",
        provider: "openai",
        updatedAt: new Date("2026-07-09T12:00:00.000Z"),
      },
    ]);
    mockedConfigurationFindMany.mockResolvedValue([
      {
        baseUrl: null,
        defaultModel: "gpt-4.1",
        enabled: true,
        provider: "openai",
      },
    ]);
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedCredentialFindMany).not.toHaveBeenCalled();
  });

  it("returns sanitized provider summaries for the current user", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      data: {
        providers: Array<{
          configured: boolean;
          defaultModel: string | null;
          maskedValue: string | null;
          provider: string;
        }>;
      };
    };
    const serialized = JSON.stringify(payload);
    const openai = payload.data.providers.find((provider) => provider.provider === "openai");

    expect(response.status).toBe(200);
    expect(openai).toMatchObject({
      configured: true,
      defaultModel: "gpt-4.1",
      maskedValue: "sk-••••••••••••1234",
    });
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("authTag");
    expect(mockedCredentialFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(mockedConfigurationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });
});
