import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    presentation: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    designProfile: {
      findFirst: vi.fn(),
    },
    reusableAsset: {
      findFirst: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreatePresentation = prisma.presentation.create as unknown as Mock;
const mockedCountPresentations = prisma.presentation.count as unknown as Mock;
const mockedFindDesignProfile = prisma.designProfile.findFirst as unknown as Mock;
const mockedFindPresentations = prisma.presentation.findMany as unknown as Mock;
const mockedFindProject = prisma.project.findFirst as unknown as Mock;
const mockedFindReusableAsset = prisma.reusableAsset.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpsertSettings = prisma.userSettings.upsert as unknown as Mock;

describe("presentations API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedCountPresentations.mockResolvedValue(0);
    mockedUpsertSettings.mockResolvedValue({
      defaultAudience: "executives",
      defaultDetailLevel: "detailed",
      defaultExportCompatibility: "strict",
      defaultExportFormat: "pptx",
      defaultImageryStyle: "editorial",
      defaultSlideCount: 8,
      defaultSpeakerNotes: "full",
      defaultTone: "executive",
      personalMaxSlideCount: 40,
      presentationLocale: "de",
    });
  });

  it("lists user-owned presentations for a project", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedFindPresentations.mockResolvedValue([
      {
        id: "presentation-1",
        projectId: "project-1",
        title: "Q3 Review",
        status: "EDITING",
        requestedSlideCount: 10,
        archivedAt: null,
        createdAt: new Date("2026-07-09T08:00:00.000Z"),
        updatedAt: new Date("2026-07-09T08:30:00.000Z"),
      },
    ]);

    const response = await GET(
      new Request("http://test.local/api/presentations?projectId=project-1"),
    );
    const payload = (await response.json()) as { data: Array<{ editorUrl: string }> };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.editorUrl).toBe("/app/presentations/presentation-1/editor");
    expect(mockedFindProject).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "project-1", OR: expect.any(Array) }) }),
    );
  });

  it("creates a presentation inside an active owned project", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedCreatePresentation.mockResolvedValue({
      id: "presentation-1",
      projectId: "project-1",
      title: "Q3 Review",
      status: "EDITING",
      requestedSlideCount: 3,
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          projectId: "project-1",
          requestedSlideCount: 3,
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as {
      data: { editorUrl: string; status: string };
    };

    expect(response.status).toBe(201);
    expect(payload.data.status).toBe("EDITING");
    expect(payload.data.editorUrl).toBe("/app/presentations/presentation-1/editor");
    expect(mockedCreatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          outputLanguage: "de",
          projectId: "project-1",
          requestedSlideCount: 3,
          status: "EDITING",
        }),
      }),
    );
  });

  it("attaches an owned active design profile when requested", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedFindDesignProfile.mockResolvedValue({
      id: "profile-1",
      name: "Board brand",
      versions: [{ profile: { colors: [] }, version: 2 }],
    });
    mockedCreatePresentation.mockResolvedValue({
      id: "presentation-1",
      projectId: "project-1",
      title: "Q3 Review",
      status: "EDITING",
      requestedSlideCount: 3,
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          designProfileId: "profile-1",
          projectId: "project-1",
          requestedSlideCount: 3,
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedFindDesignProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, id: "profile-1", ownerId: "user-1" },
      }),
    );
    expect(mockedCreatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designContext: expect.objectContaining({
            designProfile: expect.objectContaining({
              id: "profile-1",
              version: 2,
            }),
          }),
          designProfileId: "profile-1",
        }),
      }),
    );
  });

  it("rejects missing or unauthorized design profiles", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedFindDesignProfile.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          designProfileId: "profile-1",
          projectId: "project-1",
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("DESIGN_PROFILE_NOT_FOUND");
    expect(mockedCreatePresentation).not.toHaveBeenCalled();
  });

  it("applies an owned reusable asset to the initial presentation document", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedFindReusableAsset.mockResolvedValue({
      id: "asset-1",
      kind: "TEMPLATE",
      name: "Board template",
      versions: [{ definition: createReusableAssetDefinition(), version: 3 }],
    });
    mockedCreatePresentation.mockResolvedValue({
      id: "presentation-1",
      projectId: "project-1",
      title: "Q3 Review",
      status: "EDITING",
      requestedSlideCount: 2,
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          projectId: "project-1",
          requestedSlideCount: 2,
          reusableAssetId: "asset-1",
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { data: { id: string } };
    const createCall = mockedCreatePresentation.mock.calls[0]?.[0] as {
      data: {
        designContext: {
          reusableAsset: { id: string; version: number };
          theme: { colors: Record<string, string> };
        };
        reusableAssetId: string;
        slides: { create: Array<{ document: unknown }> };
      };
    };

    expect(response.status).toBe(201);
    expect(payload.data.id).toBe("presentation-1");
    expect(createCall.data.reusableAssetId).toBe("asset-1");
    expect(createCall.data.designContext.reusableAsset).toEqual({
      id: "asset-1",
      kind: "TEMPLATE",
      name: "Board template",
      version: 3,
    });
    expect(createCall.data.designContext.theme.colors.Primary).toBe("#0F766E");
    expect(mockedFindReusableAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, id: "asset-1", ownerId: "user-1" },
      }),
    );
  });

  it("rejects missing or unauthorized reusable assets", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedFindReusableAsset.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          projectId: "project-1",
          reusableAssetId: "asset-1",
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("REUSABLE_ASSET_NOT_FOUND");
    expect(mockedCreatePresentation).not.toHaveBeenCalled();
  });

  it("applies saved presentation defaults when slide count is omitted", async () => {
    mockedFindProject.mockResolvedValue({ id: "project-1" });
    mockedCreatePresentation.mockResolvedValue({
      id: "presentation-1",
      projectId: "project-1",
      title: "Q3 Review",
      status: "EDITING",
      requestedSlideCount: 8,
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          projectId: "project-1",
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedCreatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designContext: expect.objectContaining({
            defaults: expect.objectContaining({
              audience: "executives",
              detailLevel: "detailed",
              tone: "executive",
            }),
          }),
          outputLanguage: "de",
          requestedSlideCount: 8,
        }),
      }),
    );
  });

  it("rejects presentation creation for missing or archived projects", async () => {
    mockedFindProject.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local/api/presentations", {
        body: JSON.stringify({
          projectId: "project-1",
          requestedSlideCount: 3,
          title: "Q3 Review",
        }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("PROJECT_NOT_FOUND");
    expect(mockedCreatePresentation).not.toHaveBeenCalled();
  });
});

function createReusableAssetDefinition() {
  return {
    profile: {
      colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
      fonts: [{ family: "Inter", role: "Body", weight: "600" }],
      layoutRules: [],
      logos: [],
      previewCards: [],
      sourceEvidence: [],
    },
    slides: [],
  };
}
