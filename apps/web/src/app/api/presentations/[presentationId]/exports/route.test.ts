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
    export: { count: vi.fn() },
    presentation: {
      findFirst: vi.fn(),
    },
    userSettings: { upsert: vi.fn() },
  },
}));

vi.mock("../../../../../lib/presentation-exports", () => {
  class PresentationExportNotFoundError extends Error {}
  class PresentationExportForbiddenError extends Error {}
  class PresentationExportFailedError extends Error {}

  return {
    createPptxExport: vi.fn(),
    DEFAULT_PRESENTATION_EXPORT_SETTINGS: {
      compatibility: "modern",
      format: "pptx",
      imageFallbackMode: "preserve-editable",
      includeSpeakerNotes: true,
    },
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
const mockedExportCount = mockedPrisma.prisma.export.count as unknown as Mock;
const mockedSettingsUpsert = mockedPrisma.prisma.userSettings.upsert as unknown as Mock;

describe("presentation export API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
    mockedGetAuthenticatedUserId.mockResolvedValue("demo-user");
    mockedExportCount.mockResolvedValue(0);
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
      settings: {
        compatibility: "modern",
        format: "pptx",
        imageFallbackMode: "preserve-editable",
        includeSpeakerNotes: true,
      },
      userId: "demo-user",
    });
  });

  it("validates and forwards requested export settings", async () => {
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
        warnings: ["Speaker notes were excluded from this export."],
      },
      settings: {
        compatibility: "legacy",
        format: "pptx",
        imageFallbackMode: "rasterize-unsupported",
        includeSpeakerNotes: false,
      },
      warnings: ["Speaker notes were excluded from this export."],
      createdAt: "2026-07-03T10:00:00.000Z",
    });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          compatibility: "legacy",
          format: "pptx",
          imageFallbackMode: "rasterize-unsupported",
          includeSpeakerNotes: false,
        }),
        method: "POST",
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" }),
      },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data: { settings: { compatibility: string }; warnings: string[] };
    };

    expect(response.status).toBe(201);
    expect(payload.data.settings.compatibility).toBe("legacy");
    expect(payload.data.warnings).toContain("Speaker notes were excluded from this export.");
    expect(mockedCreatePptxExport).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: {
          compatibility: "legacy",
          format: "pptx",
          imageFallbackMode: "rasterize-unsupported",
          includeSpeakerNotes: false,
        },
      }),
    );
  });

  it("rejects invalid export settings", async () => {
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({ compatibility: "unknown", format: "pptx" }),
        method: "POST",
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" }),
      },
    );
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_EXPORT_SETTINGS");
    expect(mockedCreatePptxExport).not.toHaveBeenCalled();
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
            settings: {
              compatibility: "strict",
              format: "pptx",
              imageFallbackMode: "preserve-editable",
              includeSpeakerNotes: true,
            },
            warnings: ["Strict compatibility may simplify fallback-rendered visuals."],
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
      data: Array<{ downloadUrl: string; fileName: string; settings: { compatibility: string } }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.fileName).toBe("q3-review.pptx");
    expect(payload.data[0]?.settings.compatibility).toBe("strict");
    expect(payload.data[0]?.downloadUrl).toBe(
      "/api/presentations/presentation-1/exports/export-1/download",
    );
    expect(mockedFindPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "presentation-1", ownerId: "demo-user" } }),
    );
  });
});
