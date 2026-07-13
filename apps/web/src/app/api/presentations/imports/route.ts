/* global File, FormData */

import { prisma } from "@slide-agent/database";

import {
  createPptxImport,
  PresentationImportFailedError,
  PresentationImportProjectNotFoundError,
  PPTX_MIME_TYPE,
} from "../../../../lib/presentation-imports";
import { fail, ok } from "../../../../lib/api";
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "../../../../lib/billing";
import { getAuthenticatedUserId } from "../../../../lib/server-session";

const DEFAULT_MAX_UPLOAD_MB = 100;
const OCTET_STREAM_MIME_TYPE = "application/octet-stream";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be multipart form data.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("VALIDATION_FAILED", "A PowerPoint file is required.", 400);
  }

  if (!isPptxFile(file)) {
    return fail("UNSUPPORTED_FILE_TYPE", "Upload a .pptx PowerPoint file.", 415);
  }

  const maxUploadBytes = getMaxUploadBytes(process.env);
  if (file.size > maxUploadBytes) {
    return fail(
      "UPLOAD_TOO_LARGE",
      `PowerPoint uploads must be ${formatMegabytes(maxUploadBytes)} MB or smaller.`,
      413,
    );
  }

  const projectId = getProjectId(formData);
  if (!projectId) return fail("VALIDATION_FAILED", "A project id is required.", 400);

  try {
    await assertBillingQuota(userId, "presentations");
    await assertBillingQuota(userId, "storageBytes", file.size);
    const summary = await createPptxImport({
      bytes: new Uint8Array(await file.arrayBuffer()),
      client: prisma,
      fileName: file.name,
      mimeType: file.type || PPTX_MIME_TYPE,
      projectId,
      userId,
    });

    return ok(summary, 201);
  } catch (error) {
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    if (error instanceof PresentationImportProjectNotFoundError) {
      return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);
    }

    if (error instanceof PresentationImportFailedError) {
      return fail("IMPORT_FAILED", error.message, 422);
    }

    return fail("IMPORT_FAILED", "PowerPoint import could not be created.", 500);
  }
}

function getProjectId(formData: FormData): string | null {
  const value = formData.get("projectId");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPptxFile(file: File): boolean {
  const hasPptxExtension = /\.pptx$/i.test(file.name);
  const hasAllowedMimeType =
    !file.type || file.type === PPTX_MIME_TYPE || file.type === OCTET_STREAM_MIME_TYPE;
  return hasPptxExtension && hasAllowedMimeType;
}

function getMaxUploadBytes(env: Record<string, string | undefined>): number {
  const parsed = Number.parseFloat(env.GLOBAL_MAX_UPLOAD_MB ?? "");
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(megabytes * 1024 * 1024);
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 0);
}
