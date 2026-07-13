import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureDemoPresentation,
  findPresentationDocument,
  savePresentationDocument,
  prisma,
} from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "../../../../lib/server-session";
import { GET, PATCH, PUT } from "./route";

vi.mock("@slide-agent/database", () => {
  class PresentationForbiddenError extends Error {}
  class PresentationNotFoundError extends Error {}
  class PresentationVersionConflictError extends Error {}

  return {
    ensureDemoPresentation: vi.fn(),
    findPresentationDocument: vi.fn(),
    PresentationForbiddenError,
    PresentationNotFoundError,
    PresentationVersionConflictError,
    prisma: {
      presentation: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    savePresentationDocument: vi.fn(),
  };
});

vi.mock("../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedFindPresentationDocument = vi.mocked(findPresentationDocument);
const mockedSavePresentationDocument = vi.mocked(savePresentationDocument);
const mockedFindPresentation = prisma.presentation.findFirst as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedUpdatePresentation = prisma.presentation.updateMany as unknown as {
  mockResolvedValue(value: unknown): void;
};

describe("presentation document API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindPresentationDocument).not.toHaveBeenCalled();
  });

  it("rejects presentation reads owned by another user", async () => {
    mockedFindPresentationDocument.mockResolvedValue(
      createDemoPresentationDocument({ ownerId: "user-2" }),
    );

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  it("saves presentations with the authenticated owner id", async () => {
    const document = createDemoPresentationDocument({ ownerId: "user-1" });
    mockedSavePresentationDocument.mockResolvedValue(document);

    const response = await PUT(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          expectedUpdatedAt: document.metadata.updatedAt,
        }),
        method: "PUT",
      }),
      {
        params: Promise.resolve({ presentationId: document.id }),
      },
    );
    const payload = (await response.json()) as { ok: boolean; data: { id: string } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockedSavePresentationDocument).toHaveBeenCalledWith(prisma, {
      document,
      expectedUpdatedAt: document.metadata.updatedAt,
      ownerId: "user-1",
      presentationId: document.id,
    });
  });

  it("archives presentations with the authenticated owner id", async () => {
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      projectId: "project-1",
      title: "Q3 Review",
      status: "ARCHIVED",
      requestedSlideCount: 10,
      archivedAt: new Date("2026-07-09T09:00:00.000Z"),
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      {
        params: Promise.resolve({ presentationId: "presentation-1" }),
      },
    );
    const payload = (await response.json()) as { data: { archivedAt: string | null } };

    expect(response.status).toBe(200);
    expect(payload.data.archivedAt).toBe("2026-07-09T09:00:00.000Z");
    expect(prisma.presentation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "presentation-1", OR: expect.any(Array) }),
      }),
    );
  });
});
