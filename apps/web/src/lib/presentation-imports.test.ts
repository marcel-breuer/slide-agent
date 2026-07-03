import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPptxImport,
  createPresentationTitle,
  createSafePptxFileName,
  PresentationImportProjectNotFoundError,
  type PresentationImportClient,
} from "./presentation-imports";

vi.mock("@slide-agent/pptx-importer", () => ({
  importPptxPackage: vi.fn(
    async (
      _bytes: Uint8Array,
      options: { presentationId: string; ownerId: string; title: string },
    ) => ({
      document: {
        schemaVersion: "1.0.0",
        id: options.presentationId,
        title: options.title,
        locale: "en",
        format: "WIDE_16_9",
        theme: {
          colors: {
            accent: "#7c3aed",
            muted: "#64748b",
            primary: "#9333ea",
            text: "#0f172a",
          },
          fonts: { body: "Inter", heading: "Inter" },
        },
        metadata: {
          createdAt: "2026-07-03T10:00:00.000Z",
          updatedAt: "2026-07-03T10:00:00.000Z",
          ownerId: options.ownerId,
        },
        slides: [
          {
            id: "slide-1",
            order: 1,
            title: "Imported title",
            background: { type: "solid", color: "#ffffff" },
            elements: [],
            pointers: [],
            sources: [],
          },
        ],
      },
      report: {
        importedSlideCount: 1,
        importedElementCount: 2,
        fullyEditableElementCount: 2,
        partiallyEditableElementCount: 0,
        unsupportedElementCount: 0,
        warnings: [],
      },
    }),
  ),
}));

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("createPptxImport", () => {
  it("stores the upload and creates a persisted editable presentation", async () => {
    const rootDir = await createTempDir();
    const client = createImportClient();
    const bytes = createBytes();

    const summary = await createPptxImport({
      bytes,
      client,
      env: { STORAGE_DRIVER: "local", STORAGE_ROOT: rootDir },
      fileName: "Q3 Review.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      projectId: "project-1",
      userId: "user-1",
    });

    expect(summary.title).toBe("Q3 Review");
    expect(summary.report.importedSlideCount).toBe(1);
    expect(summary.report.fullyEditableElementCount).toBe(2);
    expect(summary.editorUrl).toContain(summary.presentationId);
    expect(client.createdPresentation?.title).toBe("Q3 Review");
    expect(client.createdPresentation?.slides.create).toHaveLength(1);
    expect(client.createdReport?.presentationId).toBe(summary.presentationId);

    const uploaded = await readFile(
      path.join(rootDir, "uploads", "user-1", summary.presentationId, "Q3_Review.pptx"),
    );
    expect(uploaded.length).toBe(bytes.length);
  });

  it("rejects imports into projects the user cannot access", async () => {
    const rootDir = await createTempDir();
    const client = createImportClient({ projectExists: false });
    const bytes = createBytes();

    await expect(
      createPptxImport({
        bytes,
        client,
        env: { STORAGE_DRIVER: "local", STORAGE_ROOT: rootDir },
        fileName: "deck.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        projectId: "missing-project",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(PresentationImportProjectNotFoundError);
  });
});

describe("import file helpers", () => {
  it("creates readable presentation titles from upload names", () => {
    expect(createPresentationTitle("Q3-board_review.pptx")).toBe("Q3 board review");
    expect(createPresentationTitle(".pptx")).toBe("Imported presentation");
  });

  it("normalizes unsafe upload names", () => {
    expect(createSafePptxFileName("../Q3 deck!.pptx")).toBe("Q3_deck_.pptx");
    expect(createSafePptxFileName("deck")).toBe("deck.pptx");
  });
});

type ImportClientFixture = PresentationImportClient & {
  createdPresentation?: {
    id: string;
    title: string;
    slides: { create: Array<{ id: string; order: number; document: unknown }> };
  };
  createdReport?: { id: string; presentationId: string | null; report: unknown };
};

function createImportClient({ projectExists = true } = {}): ImportClientFixture {
  const fixture: ImportClientFixture = {
    async $transaction(callback) {
      return callback({
        importReport: {
          async create(args) {
            fixture.createdReport = {
              id: args.data.id,
              presentationId: args.data.presentationId,
              report: args.data.report,
            };
            return {
              id: args.data.id,
              presentationId: args.data.presentationId,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
            };
          },
        },
        presentation: {
          async create(args) {
            fixture.createdPresentation = {
              id: args.data.id,
              title: args.data.title,
              slides: args.data.slides,
            };
            return { id: args.data.id };
          },
        },
      });
    },
    project: {
      async findFirst() {
        return projectExists ? { id: "project-1" } : null;
      },
    },
  };

  return fixture;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "slide-agent-import-"));
  tempDirs.push(dir);
  return dir;
}

function createBytes(): Uint8Array {
  return new Uint8Array([112, 112, 116, 120, 32, 98, 121, 116, 101, 115]);
}
