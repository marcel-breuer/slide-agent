import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, PATCH } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    designProfile: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    designProfileVersion: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateVersion = prisma.designProfileVersion.create as unknown as Mock;
const mockedFindProfile = prisma.designProfile.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpdateProfile = prisma.designProfile.updateMany as unknown as Mock;

describe("design profile detail API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("returns a user-owned profile detail with version history and usage count", async () => {
    mockedFindProfile.mockResolvedValue(createProfileRecord());

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ profileId: "profile-1" }),
    });
    const payload = (await response.json()) as {
      data: { usageCount: number; versions: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(payload.data.usageCount).toBe(3);
    expect(payload.data.versions).toHaveLength(1);
    expect(mockedFindProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "profile-1", ownerId: "user-1" },
      }),
    );
  });

  it("archives and restores only profiles owned by the authenticated user", async () => {
    mockedFindProfile
      .mockResolvedValueOnce({ id: "profile-1", sourceType: "manual", versions: [{ version: 1 }] })
      .mockResolvedValueOnce(
        createProfileRecord({ archivedAt: new Date("2026-07-10T10:00:00.000Z") }),
      )
      .mockResolvedValueOnce({ id: "profile-1", sourceType: "manual", versions: [{ version: 1 }] })
      .mockResolvedValueOnce(createProfileRecord({ archivedAt: null }));
    mockedUpdateProfile.mockResolvedValue({ count: 1 });

    const archiveResponse = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ profileId: "profile-1" }) },
    );
    const archivePayload = (await archiveResponse.json()) as {
      data: { archivedAt: string | null };
    };

    const restoreResponse = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: false }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ profileId: "profile-1" }) },
    );
    const restorePayload = (await restoreResponse.json()) as {
      data: { archivedAt: string | null };
    };

    expect(archiveResponse.status).toBe(200);
    expect(archivePayload.data.archivedAt).toBe("2026-07-10T10:00:00.000Z");
    expect(restoreResponse.status).toBe(200);
    expect(restorePayload.data.archivedAt).toBeNull();
    expect(mockedUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "profile-1", ownerId: "user-1" },
      }),
    );
  });

  it("creates a new version when profile rules change", async () => {
    mockedFindProfile
      .mockResolvedValueOnce({ id: "profile-1", sourceType: "manual", versions: [{ version: 2 }] })
      .mockResolvedValueOnce(createProfileRecord({ version: 3 }));
    mockedUpdateProfile.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ profile: createProfileDefinition() }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ profileId: "profile-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockedCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designProfileId: "profile-1",
          version: 3,
        }),
      }),
    );
  });

  it("returns not found before mutating another user's profile", async () => {
    mockedFindProfile.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ profileId: "profile-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });
});

function createProfileDefinition() {
  return {
    colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
    fonts: [{ family: "Inter", role: "Body", weight: "600" }],
    layoutRules: ["Keep headlines short."],
    logos: [{ altText: "Logo", placement: "Footer right" }],
    previewCards: [{ description: "Title layout", title: "Title" }],
    sourceEvidence: ["Imported from board template."],
  };
}

function createProfileRecord(overrides: { archivedAt?: Date | null; version?: number } = {}) {
  const version = overrides.version ?? 2;

  return {
    id: "profile-1",
    name: "Board brand",
    description: "Executive reporting style",
    sourceType: "manual",
    sourceEvidence: { items: ["Imported from board template."], sourceType: "manual" },
    preview: { colors: createProfileDefinition().colors },
    archivedAt: overrides.archivedAt ?? null,
    createdAt: new Date("2026-07-10T08:00:00.000Z"),
    updatedAt: new Date("2026-07-10T09:00:00.000Z"),
    _count: { presentations: 3 },
    versions: [
      {
        id: `version-${version}`,
        version,
        profile: createProfileDefinition(),
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
      },
    ],
  };
}
