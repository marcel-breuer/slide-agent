import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    designProfile: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateProfile = prisma.designProfile.create as unknown as Mock;
const mockedFindProfiles = prisma.designProfile.findMany as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("design profiles API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local/api/design-profiles"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindProfiles).not.toHaveBeenCalled();
  });

  it("lists user-owned active profiles with usage counts", async () => {
    mockedFindProfiles.mockResolvedValue([createProfileRecord()]);

    const response = await GET(new Request("http://test.local/api/design-profiles?query=brand"));
    const payload = (await response.json()) as {
      data: Array<{ activeVersion: { version: number }; usageCount: number }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.usageCount).toBe(3);
    expect(payload.data[0]?.activeVersion.version).toBe(2);
    expect(mockedFindProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          ownerId: "user-1",
        }),
      }),
    );
  });

  it("creates a manual profile with an initial version", async () => {
    mockedCreateProfile.mockResolvedValue(createProfileRecord({ version: 1 }));

    const response = await POST(
      new Request("http://test.local/api/design-profiles", {
        body: JSON.stringify({
          name: "Board brand",
          profile: createProfileDefinition(),
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { data: { id: string; sourceType: string } };

    expect(response.status).toBe(201);
    expect(payload.data.sourceType).toBe("manual");
    expect(mockedCreateProfile).toHaveBeenCalledWith(
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

  it("rejects invalid imported-like profile payloads at runtime", async () => {
    const response = await POST(
      new Request("http://test.local/api/design-profiles", {
        body: JSON.stringify({
          name: "Broken brand",
          profile: {
            ...createProfileDefinition(),
            colors: [{ hex: "teal", name: "Teal", role: "Primary" }],
          },
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedCreateProfile).not.toHaveBeenCalled();
  });
});

export function createProfileDefinition() {
  return {
    colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
    fonts: [{ family: "Inter", role: "Body", weight: "600" }],
    layoutRules: ["Keep headlines short."],
    logos: [{ altText: "Logo", placement: "Footer right" }],
    previewCards: [{ description: "Title layout", title: "Title" }],
    sourceEvidence: ["Imported from board template."],
  };
}

export function createProfileRecord(
  overrides: { archivedAt?: Date | null; sourceType?: string; version?: number } = {},
) {
  const version = overrides.version ?? 2;
  const sourceType = overrides.sourceType ?? "manual";

  return {
    id: "profile-1",
    name: "Board brand",
    description: "Executive reporting style",
    sourceType,
    sourceEvidence: { items: ["Imported from board template."], sourceType },
    preview: { colors: createProfileDefinition().colors },
    archivedAt: overrides.archivedAt ?? null,
    createdAt: new Date("2026-07-10T08:00:00.000Z"),
    updatedAt: new Date("2026-07-10T09:00:00.000Z"),
    _count: { presentations: 3 },
    versions: [
      {
        id: "version-2",
        version,
        profile: createProfileDefinition(),
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
      },
    ],
  };
}
