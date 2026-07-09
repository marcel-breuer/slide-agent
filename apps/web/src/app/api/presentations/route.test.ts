import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    presentation: {
      create: vi.fn(),
      findMany: vi.fn(),
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
const mockedFindPresentations = prisma.presentation.findMany as unknown as Mock;
const mockedFindProject = prisma.project.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpsertSettings = prisma.userSettings.upsert as unknown as Mock;

describe("presentations API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
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
      expect.objectContaining({ where: { id: "project-1", ownerId: "user-1" } }),
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
