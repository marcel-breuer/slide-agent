import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

import { encryptCredential } from "@slide-agent/auth";
import { findPresentationDocument, ensureDemoPresentation, prisma } from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  DEMO_USER_ID: "demo-user",
  ensureDemoPresentation: vi.fn(),
  findPresentationDocument: vi.fn(),
  prisma: {
    aiOperation: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    providerConfiguration: {
      findMany: vi.fn(),
    },
    providerCredential: {
      findMany: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedFindPresentationDocument = vi.mocked(findPresentationDocument);
const mockedAiOperationCreate = prisma.aiOperation.create as unknown as Mock;
const mockedAiOperationFindMany = prisma.aiOperation.findMany as unknown as Mock;
const mockedProviderConfigurationFindMany = prisma.providerConfiguration
  .findMany as unknown as Mock;
const mockedProviderCredentialFindMany = prisma.providerCredential.findMany as unknown as Mock;
const mockedUserSettingsUpsert = prisma.userSettings.upsert as unknown as Mock;

describe("AI edit proposals API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AI_PROVIDER_MODE = "mock";
    mockedGetAuthenticatedUserId.mockResolvedValue("demo-user");
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
    mockedUserSettingsUpsert.mockResolvedValue(createBudgetSettings());
    mockedAiOperationFindMany.mockResolvedValue([]);
    mockedProviderCredentialFindMany.mockResolvedValue([]);
    mockedProviderConfigurationFindMany.mockResolvedValue([]);
    mockedAiOperationCreate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindPresentationDocument).not.toHaveBeenCalled();
  });

  it("returns a deterministic proposal for pointer-guided input", async () => {
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [
            {
              id: "pointer-1",
              instruction: "Use a calmer background",
              label: "1",
              slideId: "slide-1",
              x: 240,
              y: 180,
            },
          ],
          prompt: "Use #f8fafc near pointer 1.",
          slideId: "slide-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" }),
      },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        commands: Array<{ command: { type: string; color?: string } }>;
        pointerIds: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.pointerIds).toEqual(["pointer-1"]);
    expect(payload.data.commands[0]?.command).toEqual({
      color: "#f8fafc",
      slideId: "slide-1",
      type: "UPDATE_SLIDE_BACKGROUND",
    });
    expect(mockedAiOperationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "demo-user",
          provider: "mock",
          model: "deterministic-pointer-proposal",
          taskType: "SLIDE_REVISION",
        }),
      }),
    );
    expect(mockedProviderConfigurationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "demo-user", enabled: true },
      }),
    );
  });

  it("returns a clear error when configured mode has no credentials", async () => {
    process.env.AI_PROVIDER_MODE = "configured";
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [],
          prompt: "Use #f8fafc near pointer 1.",
          slideId: "slide-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" }),
      },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
    expect(payload.error.message).toContain("Configure at least one AI provider");
    expect(mockedAiOperationCreate).not.toHaveBeenCalled();
  });

  it("executes configured provider output and records provider usage", async () => {
    process.env.AI_PROVIDER_MODE = "configured";
    process.env.CREDENTIAL_ENCRYPTION_KEY = "local-dev-encryption-key";
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedFindPresentationDocument.mockResolvedValue(document);
    const encrypted = encryptCredential("sk-test-provider-key", "local-dev-encryption-key");
    mockedProviderCredentialFindMany.mockResolvedValue([
      {
        authTag: encrypted.authTag,
        ciphertext: encrypted.ciphertext,
        enabled: true,
        keyVersion: encrypted.keyVersion,
        maskedValue: encrypted.metadata.maskedValue,
        nonce: encrypted.nonce,
        provider: "openai",
      },
    ]);
    mockedProviderConfigurationFindMany.mockResolvedValue([
      { baseUrl: "https://provider.test/v1", defaultModel: "gpt-4.1", enabled: true, provider: "openai" },
    ]);
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(body.messages[0]?.content).toContain("SLIDE_REVISION");
      expect(JSON.stringify(body)).not.toContain("sk-test-provider-key");
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  command: { color: "#f8fafc", slideId: "slide-1", type: "UPDATE_SLIDE_BACKGROUND" },
                  summary: "Use a calmer background.",
                  title: "Calmer background",
                }),
              },
            },
          ],
          usage: { completion_tokens: 6, prompt_tokens: 11 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [],
          prompt: "Use a calmer background.",
          slideId: "slide-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "demo-presentation" }) },
    );
    const payload = (await response.json()) as {
      data: {
        commands: Array<{ command: { type: string } }>;
        metadata: { model: string; provider: string; usage: { inputTokens: number; outputTokens: number } };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.commands[0]?.command.type).toBe("UPDATE_SLIDE_BACKGROUND");
    expect(payload.data.metadata).toMatchObject({
      model: "gpt-4.1",
      provider: "openai",
      usage: { inputTokens: 11, outputTokens: 6 },
    });
    expect(mockedAiOperationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inputTokens: 11, outputTokens: 6, provider: "openai" }),
      }),
    );
  });

  it("blocks edit proposals when the current user has reached a hard budget stop", async () => {
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedFindPresentationDocument.mockResolvedValue(document);
    mockedUserSettingsUpsert.mockResolvedValue(createBudgetSettings({ monthlyTokenBudget: 1000 }));
    mockedAiOperationFindMany.mockResolvedValue([
      { estimatedCost: "0.50", inputTokens: 800, outputTokens: 200 },
    ]);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [],
          prompt: "Use #f8fafc near pointer 1.",
          slideId: "slide-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" }),
      },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("BUDGET_LIMIT_REACHED");
    expect(mockedProviderCredentialFindMany).not.toHaveBeenCalled();
    expect(mockedAiOperationCreate).not.toHaveBeenCalled();
  });

  it("rejects pointer references outside the requested slide", async () => {
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [
            {
              id: "pointer-1",
              instruction: "Change this item",
              label: "1",
              slideId: "another-slide",
              x: 240,
              y: 180,
            },
          ],
          prompt: "Change the linked item.",
          slideId: "slide-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "demo-presentation" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedAiOperationCreate).not.toHaveBeenCalled();
  });
});

function createBudgetSettings(overrides = {}) {
  return {
    hardStopEnabled: true,
    monthlyMoneyBudget: null,
    monthlyTokenBudget: null,
    preferredCurrency: "EUR",
    warningThresholdPercentage: 80,
    ...overrides,
  };
}
