import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { POST } from "./route";
import { createAssetRecord, createDefinition } from "../test-fixtures";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    reusableAsset: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateAsset = prisma.reusableAsset.create as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("reusable asset import API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("imports a brand kit and preserves its source type", async () => {
    mockedCreateAsset.mockResolvedValue(createAssetRecord());

    const response = await POST(
      new Request("http://test.local/api/templates/imports", {
        body: JSON.stringify({
          definition: createDefinition(),
          kind: "BRAND_KIT",
          name: "Imported board kit",
          sourceType: "pptx",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedCreateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "BRAND_KIT", sourceType: "pptx" }),
      }),
    );
  });
});
