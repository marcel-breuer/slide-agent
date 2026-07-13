import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, POST } from "./route";
import { createAssetRecord, createDefinition } from "./test-fixtures";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    reusableAsset: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateAsset = prisma.reusableAsset.create as unknown as Mock;
const mockedFindAssets = prisma.reusableAsset.findMany as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("reusable assets API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("lists only active assets owned by the authenticated user by default", async () => {
    mockedFindAssets.mockResolvedValue([createAssetRecord()]);

    const response = await GET(new Request("http://test.local/api/templates?query=board"));
    const payload = (await response.json()) as {
      data: Array<{
        activeVersion: { compatibilityWarnings: string[]; version: number };
        usageCount: number;
        sourceType: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.activeVersion.version).toBe(2);
    expect(payload.data[0]?.usageCount).toBe(4);
    expect(payload.data[0]?.sourceType).toBe("manual");
    expect(payload.data[0]?.activeVersion.compatibilityWarnings).toHaveLength(1);
    expect(mockedFindAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: "user-1", archivedAt: null }),
      }),
    );
  });

  it("creates a versioned template owned by the authenticated user", async () => {
    mockedCreateAsset.mockResolvedValue(createAssetRecord({ version: 1 }));

    const response = await POST(
      new Request("http://test.local/api/templates", {
        body: JSON.stringify({
          definition: createDefinition(),
          name: "Board template",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { data: { activeVersion: { version: number } } };

    expect(response.status).toBe(201);
    expect(payload.data.activeVersion.version).toBe(1);
    expect(mockedCreateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          sourceType: "manual",
          versions: expect.objectContaining({
            create: expect.objectContaining({ version: 1 }),
          }),
        }),
      }),
    );
  });

  it("rejects invalid definitions before writing", async () => {
    const response = await POST(
      new Request("http://test.local/api/templates", {
        body: JSON.stringify({
          name: "Broken template",
          definition: {
            profile: {
              colors: [{ hex: "teal", name: "Invalid", role: "Primary" }],
              fonts: [],
              layoutRules: [],
              logos: [],
              previewCards: [],
              sourceEvidence: [],
            },
            slides: [],
          },
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedCreateAsset).not.toHaveBeenCalled();
  });
});
