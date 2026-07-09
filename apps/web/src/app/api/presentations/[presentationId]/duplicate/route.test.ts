import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { buildPresentationDocument, prisma } from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  buildPresentationDocument: vi.fn(),
  prisma: {
    presentation: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedBuildPresentationDocument = vi.mocked(buildPresentationDocument);
const mockedCreatePresentation = prisma.presentation.create as unknown as Mock;
const mockedFindPresentation = prisma.presentation.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("presentation duplicate API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("duplicates an active owned presentation into the same project", async () => {
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      ownerId: "user-1",
      projectId: "project-1",
      title: "Q3 Review",
      format: "WIDE_16_9",
      outputLanguage: "en",
      designContext: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
      project: { archivedAt: null },
      slides: [],
    });
    mockedBuildPresentationDocument.mockReturnValue(
      createDemoPresentationDocument({ ownerId: "user-1" }),
    );
    mockedCreatePresentation.mockResolvedValue({
      id: "presentation-copy",
      projectId: "project-1",
      title: "Q3 Review copy",
      status: "EDITING",
      requestedSlideCount: 1,
      archivedAt: null,
      createdAt: new Date("2026-07-09T09:00:00.000Z"),
      updatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({}),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as { data: { editorUrl: string } };

    expect(response.status).toBe(201);
    expect(payload.data.editorUrl).toBe("/app/presentations/presentation-copy/editor");
    expect(mockedFindPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "presentation-1", ownerId: "user-1", archivedAt: null },
      }),
    );
    expect(mockedCreatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          projectId: "project-1",
          status: "EDITING",
          title: "Q3 Review copy",
        }),
      }),
    );
  });

  it("does not duplicate missing or archived presentations", async () => {
    mockedFindPresentation.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({}),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("PRESENTATION_NOT_FOUND");
    expect(mockedCreatePresentation).not.toHaveBeenCalled();
  });
});
