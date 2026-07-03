import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type { Prisma } from "@slide-agent/database";
import { importPptxPackage, type PptxImportReport } from "@slide-agent/pptx-importer";
import { createLocalObjectStorageFromEnv, sanitizeStorageKey } from "@slide-agent/storage";

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const FALLBACK_IMPORT_FILE_NAME = "presentation.pptx";

export type PresentationImportSummary = {
  id: string;
  presentationId: string;
  projectId: string;
  title: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  report: PptxImportReport;
  editorUrl: string;
  createdAt: string;
};

type ImportReportRecord = {
  id: string;
  presentationId: string | null;
  createdAt: Date;
};

type PresentationImportTransactionClient = {
  importReport: {
    create(args: {
      data: {
        id: string;
        ownerId: string;
        presentationId: string;
        report: Prisma.InputJsonValue;
      };
    }): Promise<ImportReportRecord>;
  };
  presentation: {
    create(args: {
      data: {
        id: string;
        ownerId: string;
        projectId: string;
        title: string;
        status: "EDITING";
        requestedSlideCount: number;
        format: string;
        outputLanguage: string;
        designContext: Prisma.InputJsonValue;
        slides: {
          create: Array<{
            id: string;
            order: number;
            document: Prisma.InputJsonValue;
          }>;
        };
      };
    }): Promise<{ id: string }>;
  };
};

export type PresentationImportClient = {
  $transaction<T>(
    callback: (client: PresentationImportTransactionClient) => Promise<T>,
  ): Promise<T>;
  project: {
    findFirst(args: {
      where: {
        id: string;
        ownerId: string;
        archivedAt: null;
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export class PresentationImportProjectNotFoundError extends Error {
  constructor() {
    super("Project was not found for the current user.");
    this.name = "PresentationImportProjectNotFoundError";
  }
}

export class PresentationImportFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresentationImportFailedError";
  }
}

export async function createPptxImport({
  bytes,
  client,
  env = process.env,
  fileName,
  mimeType,
  projectId,
  userId,
}: {
  bytes: Uint8Array;
  client: PresentationImportClient;
  env?: Record<string, string | undefined>;
  fileName: string;
  mimeType: string;
  projectId: string;
  userId: string;
}): Promise<PresentationImportSummary> {
  const project = await client.project.findFirst({
    where: { id: projectId, ownerId: userId, archivedAt: null },
    select: { id: true },
  });
  if (!project) throw new PresentationImportProjectNotFoundError();

  const presentationId = randomUUID();
  const importReportId = randomUUID();
  const normalizedFileName = createSafePptxFileName(fileName);
  const storageKey = `uploads/${userId}/${presentationId}/${normalizedFileName}`;
  const checksum = createSha256Checksum(bytes);
  const storage = createLocalObjectStorageFromEnv(env);

  await storage.putObject({
    bytes,
    key: storageKey,
    mimeType: mimeType || PPTX_MIME_TYPE,
  });

  try {
    const title = createPresentationTitle(fileName);
    const { document, report } = await importPptxPackage(bytes, {
      ownerId: userId,
      presentationId,
      title,
    });

    const reportMetadata = {
      ...report,
      byteSize: bytes.length,
      checksum,
      fileName: normalizedFileName,
      importedAt: new Date().toISOString(),
      mimeType: mimeType || PPTX_MIME_TYPE,
      storageKey,
    };

    const created = await client.$transaction(async (transaction) => {
      await transaction.presentation.create({
        data: {
          id: document.id,
          ownerId: userId,
          projectId: project.id,
          title: document.title,
          status: "EDITING",
          requestedSlideCount: document.slides.length,
          format: document.format,
          outputLanguage: document.locale,
          designContext: { theme: document.theme },
          slides: {
            create: document.slides.map((slide) => ({
              id: slide.id,
              order: slide.order,
              document: slide,
            })),
          },
        },
      });

      return transaction.importReport.create({
        data: {
          id: importReportId,
          ownerId: userId,
          presentationId: document.id,
          report: reportMetadata,
        },
      });
    });

    return {
      id: created.id,
      presentationId,
      projectId: project.id,
      title: document.title,
      fileName: normalizedFileName,
      mimeType: mimeType || PPTX_MIME_TYPE,
      byteSize: bytes.length,
      report,
      editorUrl: `/app/presentations/${encodeURIComponent(presentationId)}/editor`,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PPTX import could not be created.";
    throw new PresentationImportFailedError(message);
  }
}

export function createPresentationTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.pptx$/i, "");
  const title = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return title || "Imported presentation";
}

export function createSafePptxFileName(fileName: string): string {
  const candidate = path.basename(fileName.replace(/\\/g, "/").trim()) || FALLBACK_IMPORT_FILE_NAME;
  const withExtension = /\.pptx$/i.test(candidate) ? candidate : `${candidate}.pptx`;
  return sanitizeStorageKey(withExtension).split("/").at(-1) ?? FALLBACK_IMPORT_FILE_NAME;
}

function createSha256Checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
