import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ensureDemoPresentation } from "@slide-agent/database";

import {
  createPptxExport,
  PresentationExportFailedError,
} from "../../../../../lib/presentation-exports";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  ensureDemoPresentation: vi.fn(),
  prisma: {
    presentation: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../../../../lib/presentation-exports", () => {
  class PresentationExportNotFoundError extends Error {}
  class PresentationExportForbiddenError extends Error {}
  class PresentationExportFailedError extends Error {}

  return {
    createPptxExport: vi.fn(),
    PresentationExportFailedError,
    PresentationExportForbiddenError,
    PresentationExportNotFoundError,
  };
});

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedCreatePptxExport = createPptxExport as unknown as Mock;
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedPrisma = await import("@slide-agent/database");
const mockedFindPresentation = mockedPrisma.prisma.presentation.findFirst as unknown as Mock;

describe("presentation export API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
    mockedGetAuthenticatedUserId.mockResolvedValue("demo-user");
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedCreatePptxExport).not.toHaveBeenCalled();
  });

  it("creates a PowerPoint export for the persisted presentation", async () => {
    mockedCreatePptxExport.mockResolvedValue({
      id: "export-1",
      presentationId: "demo-presentation",
      jobId: "job-1",
      fileName: "demo.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byteSize: 4096,
      downloadUrl: "/api/presentations/demo-presentation/exports/export-1/download",
      report: {
        slideCount: 3,
        elementCount: 12,
        nativeEditableElementCount: 12,
        svgFallbackCount: 0,
        pngFallbackCount: 0,
        warnings: [],
      },
      createdAt: "2026-07-03T10:00:00.000Z",
    });

    const response = await POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; data: { id: string } };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe("export-1");
    expect(mockedEnsureDemoPresentation).toHaveBeenCalled();
    expect(mockedCreatePptxExport).toHaveBeenCalledWith({
      client: mockedPrisma.prisma,
      presentationId: "demo-presentation",
      userId: "demo-user",
    });
  });

  it("returns export failures as recoverable API errors", async () => {
    mockedCreatePptxExport.mockRejectedValue(new PresentationExportFailedError("Render failed"));

    const response = await POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("EXPORT_FAILED");
    expect(payload.error.message).toBe("Render failed");
  });

  it("lists existing exports for the authenticated owner", async () => {
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      title: "Q3 Review",
      exports: [
        {
          id: "export-1",
          report: {
            byteSize: 2048,
            fileName: "q3-review.pptx",
            slideCount: 3,
          },
          createdAt: new Date("2026-07-09T10:00:00.000Z"),
        },
      ],
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      data: Array<{ downloadUrl: string; fileName: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.fileName).toBe("q3-review.pptx");
    expect(payload.data[0]?.downloadUrl).toBe(
      "/api/presentations/presentation-1/exports/export-1/download",
    );
    expect(mockedFindPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "presentation-1", ownerId: "demo-user" } }),
    );
  });
});
