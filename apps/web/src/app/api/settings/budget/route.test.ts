import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, PATCH } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    aiOperation: {
      findMany: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedAiOperationFindMany = prisma.aiOperation.findMany as unknown as Mock;
const mockedUpsertSettings = prisma.userSettings.upsert as unknown as Mock;

describe("budget settings API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedUpsertSettings.mockResolvedValue(createSettings());
    mockedAiOperationFindMany.mockResolvedValue([
      { estimatedCost: "3.50", inputTokens: 900, outputTokens: 100 },
    ]);
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedUpsertSettings).not.toHaveBeenCalled();
  });

  it("returns current user budget settings and monthly usage", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      data: {
        settings: { monthlyMoneyBudget: number };
        usage: { estimatedCost: number; tokens: number };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.settings.monthlyMoneyBudget).toBe(20);
    expect(payload.data.usage.estimatedCost).toBe(3.5);
    expect(payload.data.usage.tokens).toBe(1000);
    expect(mockedAiOperationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: "user-1",
          status: "SUCCEEDED",
        }),
      }),
    );
  });

  it("updates nullable budgets and hard stop controls", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/budget", {
        body: JSON.stringify({
          hardStopEnabled: false,
          monthlyMoneyBudget: null,
          monthlyTokenBudget: 50000,
          warningThresholdPercentage: 75,
        }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedUpsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          hardStopEnabled: false,
          monthlyMoneyBudget: null,
          monthlyTokenBudget: 50000,
          userId: "user-1",
          warningThresholdPercentage: 75,
        }),
        update: expect.objectContaining({
          hardStopEnabled: false,
          monthlyMoneyBudget: null,
          monthlyTokenBudget: 50000,
          warningThresholdPercentage: 75,
        }),
        where: { userId: "user-1" },
      }),
    );
  });

  it("rejects invalid budget settings", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings/budget", {
        body: JSON.stringify({
          monthlyMoneyBudget: -1,
          warningThresholdPercentage: 101,
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedUpsertSettings).not.toHaveBeenCalled();
  });
});

function createSettings(overrides = {}) {
  return {
    hardStopEnabled: true,
    monthlyMoneyBudget: "20",
    monthlyTokenBudget: 5000,
    preferredCurrency: "EUR",
    warningThresholdPercentage: 80,
    ...overrides,
  };
}
