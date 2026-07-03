import { cookies } from "next/headers";
import { z } from "zod";

import {
  ensureDemoPresentation,
  findPresentationDocument,
  PresentationNotFoundError,
  PresentationVersionConflictError,
  prisma,
  savePresentationDocument,
} from "@slide-agent/database";
import { DEMO_PRESENTATION_ID, PresentationDocumentSchema } from "@slide-agent/presentation-schema";

import { fail, ok } from "@/lib/api";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const PresentationUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  document: PresentationDocumentSchema,
});

export async function GET(_request: Request, context: RouteContext) {
  if (!(await hasSession())) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const document = await findPresentationDocument(prisma, presentationId);
  if (!document) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  return ok(document);
}

export async function PUT(request: Request, context: RouteContext) {
  if (!(await hasSession())) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PresentationUpdateSchema.safeParse(body);
  if (!parsed.success)
    return fail("VALIDATION_FAILED", "Presentation document update is invalid.", 400);

  try {
    const document = await savePresentationDocument(prisma, {
      presentationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      document: parsed.data.document,
    });

    return ok(document);
  } catch (error) {
    if (error instanceof PresentationNotFoundError) {
      return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);
    }

    if (error instanceof PresentationVersionConflictError) {
      return fail(
        "PRESENTATION_VERSION_CONFLICT",
        "Presentation changed since it was loaded.",
        409,
      );
    }

    if (error instanceof Error) {
      return fail("VALIDATION_FAILED", error.message, 400);
    }

    return fail("SAVE_FAILED", "Presentation could not be saved.", 500);
  }
}

async function hasSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
