import { randomUUID } from "node:crypto";

import {
  findPresentationDocument,
  type PresentationLookupClient,
  type Prisma,
} from "@slide-agent/database";
import { exportPresentation, type ExportReport } from "@slide-agent/pptx-exporter";
import { createLocalObjectStorageFromEnv } from "@slide-agent/storage";

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export type PresentationExportSummary = {
  id: string;
  presentationId: string;
  jobId: string;
  fileName: string;
  mimeType: typeof PPTX_MIME_TYPE;
  byteSize: number;
  downloadUrl: string;
  report: ExportReport;
  settings: PresentationExportSettings;
  warnings: string[];
  createdAt: string;
};

export type PresentationExportSettings = {
  compatibility: "legacy" | "modern" | "strict";
  format: "pptx";
  imageFallbackMode: "preserve-editable" | "rasterize-unsupported";
  includeSpeakerNotes: boolean;
};

export const DEFAULT_PRESENTATION_EXPORT_SETTINGS: PresentationExportSettings = {
  compatibility: "modern",
  format: "pptx",
  imageFallbackMode: "preserve-editable",
  includeSpeakerNotes: true,
};

export type PresentationExportDownload = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: typeof PPTX_MIME_TYPE;
};

type ExportRecord = {
  id: string;
  presentationId: string;
  storageKey: string;
  report: Prisma.JsonValue;
  createdAt: Date;
};

type PresentationExportClient = PresentationLookupClient & {
  export: {
    create(args: {
      data: {
        id: string;
        ownerId: string;
        presentationId: string;
        storageKey: string;
        report: Prisma.InputJsonValue;
      };
    }): Promise<ExportRecord>;
    findFirst(args: {
      where: {
        id: string;
        ownerId?: string;
        presentationId: string;
      };
      select: {
        id: true;
        presentationId: true;
        storageKey: true;
        report: true;
        createdAt: true;
      };
    }): Promise<ExportRecord | null>;
  };
  generationJob: {
    create(args: {
      data: {
        id: string;
        ownerId: string;
        presentationId: string;
        type: "PPTX_EXPORT";
        idempotencyKey: string;
        status: string;
        progress: number;
      };
    }): Promise<unknown>;
    update(args: {
      where: { id: string };
      data: {
        status: string;
        progress: number;
        error?: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
  presentation: PresentationLookupClient["presentation"] & {
    updateMany(args: {
      where: { id: string; ownerId: string };
      data: { lastExportAt: Date };
    }): Promise<{ count: number }>;
  };
};

export class PresentationExportNotFoundError extends Error {
  constructor() {
    super("Presentation export was not found.");
    this.name = "PresentationExportNotFoundError";
  }
}

export class PresentationExportForbiddenError extends Error {
  constructor() {
    super("Presentation export is not available for this user.");
    this.name = "PresentationExportForbiddenError";
  }
}

export class PresentationExportFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresentationExportFailedError";
  }
}

export async function createPptxExport({
  client,
  env = process.env,
  allowSharedAccess = false,
  presentationId,
  settings = DEFAULT_PRESENTATION_EXPORT_SETTINGS,
  userId,
}: {
  client: PresentationExportClient;
  env?: Record<string, string | undefined>;
  presentationId: string;
  settings?: PresentationExportSettings;
  userId: string;
  allowSharedAccess?: boolean;
}): Promise<PresentationExportSummary> {
  const document = await findPresentationDocument(client, presentationId);
  if (!document) throw new PresentationExportNotFoundError();
  if (!allowSharedAccess && document.metadata.ownerId !== userId) {
    throw new PresentationExportForbiddenError();
  }

  const exportId = randomUUID();
  const jobId = randomUUID();
  await client.generationJob.create({
    data: {
      id: jobId,
      ownerId: userId,
      presentationId,
      type: "PPTX_EXPORT",
      idempotencyKey: `pptx-export:${presentationId}:${jobId}`,
      status: "RUNNING",
      progress: 10,
    },
  });

  try {
    const { buffer, report } = await exportPresentation(document, {
      includeSpeakerNotes: settings.includeSpeakerNotes,
    });
    const warnings = buildCompatibilityWarnings(settings, report);
    const reportWithWarnings: ExportReport = {
      ...report,
      warnings: [...report.warnings, ...warnings],
    };
    const fileName = createPptxFileName(document.title);
    const storageKey = `exports/${presentationId}/${exportId}/${fileName}`;
    const storage = createLocalObjectStorageFromEnv(env);
    await storage.putObject({
      bytes: buffer,
      key: storageKey,
      mimeType: PPTX_MIME_TYPE,
    });

    const createdAt = new Date();
    const metadata = {
      ...reportWithWarnings,
      byteSize: buffer.length,
      fileName,
      generatedAt: createdAt.toISOString(),
      jobId,
      mimeType: PPTX_MIME_TYPE,
      settings,
      warnings: reportWithWarnings.warnings,
    };
    const exportRecord = await client.export.create({
      data: {
        id: exportId,
        ownerId: userId,
        presentationId,
        storageKey,
        report: metadata,
      },
    });

    await Promise.all([
      client.generationJob.update({
        where: { id: jobId },
        data: { status: "SUCCEEDED", progress: 100 },
      }),
      client.presentation.updateMany({
        where: { id: presentationId, ownerId: userId },
        data: { lastExportAt: createdAt },
      }),
    ]);

    return {
      id: exportRecord.id,
      presentationId,
      jobId,
      fileName,
      mimeType: PPTX_MIME_TYPE,
      byteSize: buffer.length,
      downloadUrl: buildExportDownloadUrl(presentationId, exportRecord.id),
      report: reportWithWarnings,
      settings,
      warnings: reportWithWarnings.warnings,
      createdAt: exportRecord.createdAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PPTX export could not be created.";
    await client.generationJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        progress: 100,
        error: {
          code: "PPTX_EXPORT_FAILED",
          message,
          failedAt: new Date().toISOString(),
        },
      },
    });
    throw new PresentationExportFailedError(message);
  }
}

export async function readPptxExportDownload({
  client,
  env = process.env,
  allowSharedAccess = false,
  exportId,
  presentationId,
  userId,
}: {
  client: PresentationExportClient;
  env?: Record<string, string | undefined>;
  exportId: string;
  presentationId: string;
  userId: string;
  allowSharedAccess?: boolean;
}): Promise<PresentationExportDownload> {
  const exportRecord = await client.export.findFirst({
    where: allowSharedAccess
      ? { id: exportId, presentationId }
      : { id: exportId, ownerId: userId, presentationId },
    select: {
      id: true,
      presentationId: true,
      storageKey: true,
      report: true,
      createdAt: true,
    },
  });
  if (!exportRecord) throw new PresentationExportNotFoundError();

  const storage = createLocalObjectStorageFromEnv(env);
  const report = asRecord(exportRecord.report);
  return {
    bytes: await storage.readObject({ key: exportRecord.storageKey }),
    fileName:
      typeof report?.fileName === "string" ? report.fileName : createPptxFileName("presentation"),
    mimeType: PPTX_MIME_TYPE,
  };
}

function buildExportDownloadUrl(presentationId: string, exportId: string): string {
  return `/api/presentations/${encodeURIComponent(
    presentationId,
  )}/exports/${encodeURIComponent(exportId)}/download`;
}

function createPptxFileName(title: string): string {
  const baseName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${baseName || "presentation"}.pptx`;
}

function buildCompatibilityWarnings(
  settings: PresentationExportSettings,
  report: ExportReport,
): string[] {
  const warnings: string[] = [];

  if (
    settings.compatibility === "strict" &&
    report.svgFallbackCount + report.pngFallbackCount > 0
  ) {
    warnings.push("Strict compatibility may simplify fallback-rendered visuals.");
  }

  if (settings.compatibility === "legacy") {
    warnings.push(
      "Legacy compatibility may flatten advanced styling for older PowerPoint versions.",
    );
  }

  if (settings.imageFallbackMode === "rasterize-unsupported") {
    warnings.push("Unsupported visuals may be rasterized and become non-editable.");
  }

  if (!settings.includeSpeakerNotes) {
    warnings.push("Speaker notes were excluded from this export.");
  }

  return warnings;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
