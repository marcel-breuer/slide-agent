import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ensureDemoPresentation } from "@slide-agent/database";

import { readPptxExportDownload } from "../../../../../../../lib/presentation-exports";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@slide-agent/database", () => ({
  DEMO_USER_ID: "demo-user",
  ensureDemoPresentation: vi.fn(),
  prisma: {},
}));

vi.mock("../../../../../../../lib/presentation-exports", () => {
  class PresentationExportNotFoundError extends Error {}
  class PresentationExportForbiddenError extends Error {}

  return {
    PPTX_MIME_TYPE: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    PresentationExportForbiddenError,
    PresentationExportNotFoundError,
    readPptxExportDownload: vi.fn(),
  };
});

const mockedCookies = vi.mocked(cookies);
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedReadPptxExportDownload = readPptxExportDownload as unknown as Mock;

describe("presentation export download API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
  });

  it("requires an authenticated session", async () => {
    mockedCookies.mockResolvedValue({ get: () => undefined } as never);

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation", exportId: "export-1" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedReadPptxExportDownload).not.toHaveBeenCalled();
  });

  it("streams a PowerPoint export download", async () => {
    mockedCookies.mockResolvedValue({ get: () => ({ value: "session" }) } as never);
    mockedReadPptxExportDownload.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "demo.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation", exportId: "export-1" }),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="demo.pptx"');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(mockedReadPptxExportDownload).toHaveBeenCalledWith({
      client: {},
      exportId: "export-1",
      presentationId: "demo-presentation",
      userId: "demo-user",
    });
  });
});
