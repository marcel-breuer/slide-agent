import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, PATCH } from "./route";
import { createAssetRecord, createDefinition } from "../test-fixtures";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    reusableAsset: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    reusableAssetVersion: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateVersion = prisma.reusableAssetVersion.create as unknown as Mock;
const mockedFindAsset = prisma.reusableAsset.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpdateAsset = prisma.reusableAsset.updateMany as unknown as Mock;

describe("reusable asset detail API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("returns owned version history", async () => {
    mockedFindAsset.mockResolvedValue(createAssetRecord());

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ templateId: "asset-1" }),
    });
    const payload = (await response.json()) as { data: { versions: unknown[] } };

    expect(response.status).toBe(200);
    expect(payload.data.versions).toHaveLength(1);
    expect(mockedFindAsset).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-1", ownerId: "user-1" } }),
    );
  });

  it("archives an asset without mutating another user's record", async () => {
    mockedFindAsset
      .mockResolvedValueOnce({ id: "asset-1", versions: [{ version: 1 }] })
      .mockResolvedValueOnce(
        createAssetRecord({ archivedAt: new Date("2026-07-10T10:00:00.000Z") }),
      );
    mockedUpdateAsset.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ templateId: "asset-1" }) },
    );
    const payload = (await response.json()) as { data: { archivedAt: string | null } };

    expect(response.status).toBe(200);
    expect(payload.data.archivedAt).toBe("2026-07-10T10:00:00.000Z");
    expect(mockedUpdateAsset).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-1", ownerId: "user-1" } }),
    );
  });

  it("creates the next immutable version when the definition changes", async () => {
    mockedFindAsset
      .mockResolvedValueOnce({ id: "asset-1", versions: [{ version: 2 }] })
      .mockResolvedValueOnce(createAssetRecord({ version: 3 }));
    mockedUpdateAsset.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ definition: createDefinition() }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ templateId: "asset-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockedCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reusableAssetId: "asset-1", version: 3 }),
      }),
    );
  });

  it("returns not found before mutating an asset owned by someone else", async () => {
    mockedFindAsset.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ templateId: "asset-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedUpdateAsset).not.toHaveBeenCalled();
  });
});
