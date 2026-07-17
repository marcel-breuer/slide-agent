import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, PATCH } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    userSettings: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpdateSettings = prisma.userSettings.update as unknown as Mock;
const mockedUpsertSettings = prisma.userSettings.upsert as unknown as Mock;

describe("settings API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedUpsertSettings.mockResolvedValue(createSettings());
    mockedUpdateSettings.mockResolvedValue(createSettings({ defaultSlideCount: 12 }));
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET();
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedUpsertSettings).not.toHaveBeenCalled();
  });

  it("returns persisted user settings", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      data: { defaultSlideCount: number; presentationLocale: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data.defaultSlideCount).toBe(10);
    expect(payload.data.presentationLocale).toBe("en");
    expect(mockedUpsertSettings).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {},
      create: { userId: "user-1" },
    });
  });

  it("updates presentation defaults", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings", {
        body: JSON.stringify({
          defaultAudience: "executives",
          defaultDetailLevel: "detailed",
          defaultSlideCount: 12,
          defaultTone: "executive",
          personalMaxSlideCount: 30,
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { data: { defaultSlideCount: number } };

    expect(response.status).toBe(200);
    expect(payload.data.defaultSlideCount).toBe(12);
    expect(mockedUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defaultAudience: "executives",
          defaultDetailLevel: "detailed",
          defaultSlideCount: 12,
          defaultTone: "executive",
          personalMaxSlideCount: 30,
        }),
        where: { userId: "user-1" },
      }),
    );
  });

  it("rejects a default slide count above the personal maximum", async () => {
    const response = await PATCH(
      new Request("http://test.local/api/settings", {
        body: JSON.stringify({
          defaultSlideCount: 40,
          personalMaxSlideCount: 20,
        }),
        method: "PATCH",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedUpdateSettings).not.toHaveBeenCalled();
  });
});

function createSettings(overrides: Partial<ReturnType<typeof createSettingsRecord>> = {}) {
  return createSettingsRecord(overrides);
}

function createSettingsRecord(overrides = {}) {
  return {
    defaultAudience: "business",
    defaultDetailLevel: "balanced",
    defaultExportCompatibility: "modern",
    defaultExportFormat: "pptx",
    defaultImageryStyle: "minimal",
    defaultSlideCount: 10,
    defaultSpeakerNotes: "talking-points",
    defaultTone: "professional",
    personalMaxSlideCount: 50,
    presentationLocale: "en",
    timeZone: "Europe/Berlin",
    uiLocale: "en",
    ...overrides,
  };
}
