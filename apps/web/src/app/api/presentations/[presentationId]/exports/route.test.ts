import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ensureDemoPresentation, findPresentationDocument, prisma } from "@slide-agent/database";
import { exportPresentation } from "@slide-agent/pptx-exporter";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";
import { createLocalObjectStorageFromEnv } from "@slide-agent/storage";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  ensureDemoPresentation: vi.fn(),
  findPresentationDocument: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@slide-agent/pptx-exporter", () => ({
  exportPresentation: vi.fn(),
}));

vi.mock("@slide-agent/storage", () => ({
  createLocalObjectStorageFromEnv: vi.fn(),
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedFindPresentationDocument = vi.mocked(findPresentationDocument);
const mockedExportPresentation = vi.mocked(exportPresentation);
const mockedCreateLocalObjectStorageFromEnv = vi.mocked(createLocalObjectStorageFromEnv);
const mockedTransaction = prisma.$transaction as unknown as Mock;
const storage = {
  putObject: vi.fn(),
};

describe("presentation exports API", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { getAuthenticatedUserId } = await import("../../../../../lib/server-session");
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("demo-user");
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
    mockedCreateLocalObjectStorageFromEnv.mockReturnValue(storage as never);
    mockedExportPresentation.mockResolvedValue({
      buffer: Buffer.from("pptx"),
      report: {
        elementCount: 2,
        nativeEditableElementCount: 2,
        pngFallbackCount: 0,
        slideCount: 1,
        svgFallbackCount: 0,
        warnings: [],
      },
    });
    mockedTransaction.mockImplementation(async (callback) =>
      callback({
        export: {
          create: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-07-03T10:00:00.000Z"),
            id: "export-1",
            storageKey: "exports/demo-user/demo-presentation/export-1.pptx",
          }),
        },
        presentation: {
          update: vi.fn().mockResolvedValue({}),
        },
      }),
    );
  });

  it("requires an authenticated session", async () => {
    const { getAuthenticatedUserId } = await import("../../../../../lib/server-session");
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(null);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindPresentationDocument).not.toHaveBeenCalled();
  });

  it("creates a stored PowerPoint export and returns a download URL", async () => {
    const document = createDemoPresentationDocument({ ownerId: "demo-user" });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        downloadUrl: string;
        fileName: string;
        report: { slideCount: number };
      };
    };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.data.downloadUrl).toMatch(
      /^\/api\/presentations\/demo-presentation\/exports\//,
    );
    expect(payload.data.fileName).toBe("Q3 Operating Review.pptx");
    expect(payload.data.report.slideCount).toBe(1);
    expect(mockedExportPresentation).toHaveBeenCalledWith(document);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Buffer.from("pptx"),
        key: expect.stringMatching(/^exports\/demo-user\/demo-presentation\/.+\.pptx$/),
      }),
    );
  });

  it("rejects access to another user's presentation", async () => {
    const document = createDemoPresentationDocument({ ownerId: "other-user" });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(mockedExportPresentation).not.toHaveBeenCalled();
  });
});
