import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDemoPresentation, prisma } from "@slide-agent/database";
import { createLocalObjectStorageFromEnv } from "@slide-agent/storage";

import { GET } from "./route";

vi.mock("@slide-agent/database", () => ({
  ensureDemoPresentation: vi.fn(),
  prisma: {
    export: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@slide-agent/storage", () => ({
  createLocalObjectStorageFromEnv: vi.fn(),
}));

vi.mock("../../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedExportFindFirst = vi.mocked(prisma.export.findFirst);
const mockedCreateLocalObjectStorageFromEnv = vi.mocked(createLocalObjectStorageFromEnv);
const storage = {
  readObject: vi.fn(),
};

describe("presentation export download API", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { getAuthenticatedUserId } = await import("../../../../../../lib/server-session");
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("demo-user");
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
    mockedCreateLocalObjectStorageFromEnv.mockReturnValue(storage as never);
    mockedExportFindFirst.mockResolvedValue({
      id: "export-1",
      ownerId: "demo-user",
      presentation: { title: "Q3 Operating Review" },
      presentationId: "demo-presentation",
      report: {},
      storageKey: "exports/demo-user/demo-presentation/export-1.pptx",
      createdAt: new Date("2026-07-03T10:00:00.000Z"),
    } as never);
    storage.readObject.mockResolvedValue(Buffer.from("pptx"));
  });

  it("streams a stored PowerPoint export", async () => {
    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ exportId: "export-1", presentationId: "demo-presentation" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Q3 Operating Review.pptx"',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("pptx");
    expect(storage.readObject).toHaveBeenCalledWith({
      key: "exports/demo-user/demo-presentation/export-1.pptx",
    });
  });

  it("returns not found for unknown exports", async () => {
    mockedExportFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ exportId: "missing", presentationId: "demo-presentation" }),
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("EXPORT_NOT_FOUND");
    expect(storage.readObject).not.toHaveBeenCalled();
  });
});
