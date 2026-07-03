import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ensureDemoPresentation } from "@slide-agent/database";

import {
  createPptxExport,
  PresentationExportFailedError,
} from "../../../../../lib/presentation-exports";
import { POST } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@slide-agent/database", () => ({
  DEMO_USER_ID: "demo-user",
  ensureDemoPresentation: vi.fn(),
  prisma: {},
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

const mockedCookies = vi.mocked(cookies);
const mockedCreatePptxExport = createPptxExport as unknown as Mock;
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);

describe("presentation export API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
  });

  it("requires an authenticated session", async () => {
    mockedCookies.mockResolvedValue({ get: () => undefined } as never);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedCreatePptxExport).not.toHaveBeenCalled();
  });

  it("creates a PowerPoint export for the persisted presentation", async () => {
    mockedCookies.mockResolvedValue({ get: () => ({ value: "session" }) } as never);
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
      client: {},
      presentationId: "demo-presentation",
      userId: "demo-user",
    });
  });

  it("returns export failures as recoverable API errors", async () => {
    mockedCookies.mockResolvedValue({ get: () => ({ value: "session" }) } as never);
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
});
