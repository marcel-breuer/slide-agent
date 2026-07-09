import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { DELETE, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    providerConfiguration: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    providerCredential: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedConfigurationDeleteMany = prisma.providerConfiguration.deleteMany as unknown as Mock;
const mockedConfigurationUpsert = prisma.providerConfiguration.upsert as unknown as Mock;
const mockedCredentialDeleteMany = prisma.providerCredential.deleteMany as unknown as Mock;
const mockedCredentialFindUnique = prisma.providerCredential.findUnique as unknown as Mock;
const mockedCredentialUpdate = prisma.providerCredential.update as unknown as Mock;
const mockedCredentialUpsert = prisma.providerCredential.upsert as unknown as Mock;

describe("provider credential API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedCredentialFindUnique.mockResolvedValue(null);
    mockedCredentialUpdate.mockResolvedValue({
      enabled: false,
      maskedValue: "sk-••••••••••••1234",
    });
    mockedCredentialUpsert.mockImplementation(
      (args: { create: { maskedValue: string } }) => args.create,
    );
    mockedConfigurationUpsert.mockResolvedValue({});
    mockedCredentialDeleteMany.mockResolvedValue({ count: 1 });
    mockedConfigurationDeleteMany.mockResolvedValue({ count: 1 });
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

  it("stores encrypted credentials and user-scoped provider defaults", async () => {
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          apiKey: "sk-test-secret-AB12",
          defaultModel: "gpt-4.1",
          enabled: true,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ provider: "openai" }) },
    );
    const payload = (await response.json()) as {
      data: { defaultModel: string; maskedValue: string | null };
    };
    const upsertArgs = mockedCredentialUpsert.mock.calls[0]?.[0] as {
      create: { ciphertext: string; maskedValue: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data.defaultModel).toBe("gpt-4.1");
    expect(payload.data.maskedValue).toBe("sk-••••••••••••AB12");
    expect(upsertArgs.create.ciphertext).not.toContain("sk-test-secret-AB12");
    expect(upsertArgs.create.maskedValue).not.toBe("sk-test-secret-AB12");
    expect(mockedConfigurationUpsert).toHaveBeenCalledWith({
      where: { userId_provider: { userId: "user-1", provider: "openai" } },
      update: {
        baseUrl: null,
        defaultModel: "gpt-4.1",
        enabled: true,
      },
      create: {
        userId: "user-1",
        provider: "openai",
        baseUrl: null,
        defaultModel: "gpt-4.1",
        enabled: true,
      },
    });
  });

  it("deletes only the signed-in user's provider credential and configuration", async () => {
    const response = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({ provider: "openai" }),
    });
    const payload = (await response.json()) as { data: { deleted: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.deleted).toBe(true);
    expect(mockedCredentialDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "openai" },
    });
    expect(mockedConfigurationDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "openai" },
    });
  });
});
