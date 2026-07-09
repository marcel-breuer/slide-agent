import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureDemoPresentation,
  findPresentationDocument,
  savePresentationDocument,
} from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "../../../../lib/server-session";
import { GET, PUT } from "./route";

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
    prisma: {},
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
    expect(mockedSavePresentationDocument).toHaveBeenCalledWith(
      {},
      {
        document,
        expectedUpdatedAt: document.metadata.updatedAt,
        ownerId: "user-1",
        presentationId: document.id,
      },
    );
  });
});
