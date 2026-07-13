/* global File, FormData */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";
import { createPptxImport } from "../../../../lib/presentation-imports";
import { getAuthenticatedUserId } from "../../../../lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    export: { findMany: vi.fn() },
    importReport: { findMany: vi.fn() },
    presentation: { count: vi.fn() },
    userSettings: { upsert: vi.fn() },
  },
}));

vi.mock("../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

vi.mock("../../../../lib/presentation-imports", () => {
  class PresentationImportProjectNotFoundError extends Error {}
  class PresentationImportFailedError extends Error {}

  return {
    createPptxImport: vi.fn(),
    PresentationImportFailedError,
    PresentationImportProjectNotFoundError,
    PPTX_MIME_TYPE: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
});

const mockedCreatePptxImport = createPptxImport as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedPresentationCount = prisma.presentation.count as unknown as Mock;
const mockedImportFindMany = prisma.importReport.findMany as unknown as Mock;
const mockedExportFindMany = prisma.export.findMany as unknown as Mock;
const mockedSettingsUpsert = prisma.userSettings.upsert as unknown as Mock;

describe("presentation import API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.GLOBAL_MAX_UPLOAD_MB;
    mockedGetAuthenticatedUserId.mockResolvedValue("demo-user");
    mockedPresentationCount.mockResolvedValue(0);
    mockedImportFindMany.mockResolvedValue([]);
    mockedExportFindMany.mockResolvedValue([]);
    mockedSettingsUpsert.mockResolvedValue({
      billingCancelAtPeriodEnd: false,
      billingGraceUntil: null,
      billingPeriodEnd: null,
      billingPeriodStart: null,
      billingPlanCode: "free",
      billingStatus: "active",
    });
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await POST(createImportRequest(createPptxFile()));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedCreatePptxImport).not.toHaveBeenCalled();
  });

  it("rejects non-PowerPoint uploads", async () => {
    const response = await POST(createImportRequest(new File(["x"], "notes.txt")));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(415);
    expect(payload.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(mockedCreatePptxImport).not.toHaveBeenCalled();
  });

  it("rejects uploads over the configured size limit", async () => {
    process.env.GLOBAL_MAX_UPLOAD_MB = "0.000001";

    const response = await POST(createImportRequest(createPptxFile("deck.pptx", "abcdef")));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe("UPLOAD_TOO_LARGE");
    expect(mockedCreatePptxImport).not.toHaveBeenCalled();
  });

  it("imports a valid PowerPoint file into the selected project", async () => {
    mockedCreatePptxImport.mockResolvedValue({
      id: "import-1",
      presentationId: "presentation-1",
      projectId: "project-demo",
      title: "Deck",
      fileName: "Deck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byteSize: 4,
      report: {
        importedSlideCount: 1,
        importedElementCount: 2,
        fullyEditableElementCount: 2,
        partiallyEditableElementCount: 0,
        unsupportedElementCount: 0,
        warnings: [],
      },
      editorUrl: "/app/presentations/presentation-1/editor",
      createdAt: "2026-07-03T10:00:00.000Z",
    });

    const response = await POST(
      createImportRequest(createPptxFile("Deck.pptx", "data"), "project-demo"),
    );
    const payload = (await response.json()) as { ok: boolean; data: { presentationId: string } };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.data.presentationId).toBe("presentation-1");
    expect(mockedCreatePptxImport).toHaveBeenCalledWith(
      expect.objectContaining({
        client: expect.any(Object),
        fileName: "Deck.pptx",
        projectId: "project-demo",
        userId: "demo-user",
      }),
    );
  });

  it("requires a project id", async () => {
    const response = await POST(createImportRequest(createPptxFile("Deck.pptx", "data")));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(mockedCreatePptxImport).not.toHaveBeenCalled();
  });
});

function createImportRequest(file: File, projectId?: string): Request {
  const formData = new FormData();
  formData.set("file", file);
  if (projectId) formData.set("projectId", projectId);
  return new Request("http://test.local/api/presentations/imports", {
    body: formData,
    method: "POST",
  });
}

function createPptxFile(name = "deck.pptx", contents = "pptx"): File {
  return new File([contents], name, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
