import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    designProfile: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateProfile = prisma.designProfile.create as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("design profile import API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("imports a validated profile for the authenticated owner", async () => {
    mockedCreateProfile.mockResolvedValue(
      createProfileRecord({ sourceType: "pptx-master", version: 1 }),
    );

    const response = await POST(
      new Request("http://test.local/api/design-profiles/imports", {
        body: JSON.stringify({
          name: "Imported brand",
          profile: createProfileDefinition(),
          sourceEvidence: ["Read from uploaded master."],
          sourceType: "pptx-master",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { data: { sourceType: string } };

    expect(response.status).toBe(201);
    expect(payload.data.sourceType).toBe("pptx-master");
    expect(mockedCreateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          sourceType: "pptx-master",
          sourceEvidence: expect.objectContaining({
            items: ["Read from uploaded master."],
          }),
        }),
      }),
    );
  });

  it("rejects invalid import JSON shape", async () => {
    const response = await POST(
      new Request("http://test.local/api/design-profiles/imports", {
        body: JSON.stringify({ name: "Missing profile" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedCreateProfile).not.toHaveBeenCalled();
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

function createProfileRecord(overrides: { sourceType?: string; version?: number } = {}) {
  const sourceType = overrides.sourceType ?? "manual";

  return {
    id: "profile-1",
    name: "Board brand",
    description: "Executive reporting style",
    sourceType,
    sourceEvidence: { items: ["Imported from board template."], sourceType },
    preview: { colors: createProfileDefinition().colors },
    archivedAt: null,
    createdAt: new Date("2026-07-10T08:00:00.000Z"),
    updatedAt: new Date("2026-07-10T09:00:00.000Z"),
    _count: { presentations: 3 },
    versions: [
      {
        id: "version-1",
        version: overrides.version ?? 1,
        profile: createProfileDefinition(),
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
      },
    ],
  };
}
