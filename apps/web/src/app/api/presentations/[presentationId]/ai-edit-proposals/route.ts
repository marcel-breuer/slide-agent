import { cookies } from "next/headers";
import { z } from "zod";

import { createPointerDrivenEditProposal } from "@slide-agent/editor-core";
import {
  ensureDemoPresentation,
  findPresentationDocument,
  prisma
} from "@slide-agent/database";
import { DEMO_PRESENTATION_ID, LOGICAL_SLIDE_HEIGHT, LOGICAL_SLIDE_WIDTH, PresentationDocumentSchema } from "@slide-agent/presentation-schema";

import { fail, ok } from "../../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

const SlidePointerRequestSchema = z.object({
  id: z.string().min(1),
  slideId: z.string().min(1),
  label: z.string().min(1).max(12),
  x: z.number().finite().min(0).max(LOGICAL_SLIDE_WIDTH),
  y: z.number().finite().min(0).max(LOGICAL_SLIDE_HEIGHT),
  instruction: z.string().min(1).max(1000)
});

const AiEditProposalRequestSchema = z.object({
  document: PresentationDocumentSchema,
  pointers: z.array(SlidePointerRequestSchema).max(25),
  prompt: z.string().trim().min(1).max(4000),
  selectedElementId: z.string().min(1).optional(),
  slideId: z.string().min(1)
});

export async function POST(request: Request, context: RouteContext) {
  if (!(await hasSession())) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const persistedDocument = await findPresentationDocument(prisma, presentationId);
  if (!persistedDocument) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = AiEditProposalRequestSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "AI edit proposal input is invalid.", 400);

  if (parsed.data.document.id !== presentationId) {
    return fail("VALIDATION_FAILED", "Presentation document id does not match the route id.", 400);
  }

  try {
    const proposalInput = {
      document: parsed.data.document,
      pointers: parsed.data.pointers,
      prompt: parsed.data.prompt,
      slideId: parsed.data.slideId,
      ...(parsed.data.selectedElementId ? { selectedElementId: parsed.data.selectedElementId } : {})
    };
    const proposal = createPointerDrivenEditProposal(proposalInput);

    return ok(proposal);
  } catch (error) {
    return fail(
      "PROPOSAL_FAILED",
      error instanceof Error ? error.message : "AI edit proposal could not be created.",
      400
    );
  }
}

async function hasSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
