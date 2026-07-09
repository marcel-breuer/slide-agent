import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createPointerDrivenEditProposal } from "@slide-agent/editor-core";
import { ensureDemoPresentation, findPresentationDocument, prisma } from "@slide-agent/database";
import {
  DEMO_PRESENTATION_ID,
  LOGICAL_SLIDE_HEIGHT,
  LOGICAL_SLIDE_WIDTH,
  PresentationDocumentSchema,
} from "@slide-agent/presentation-schema";

import {
  AiRoutingConfigurationError,
  aiProviderModeFromEnv,
  resolveAiEditRouting,
} from "../../../../../lib/ai-provider-routing";
import { fail, ok } from "../../../../../lib/api";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";

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
  instruction: z.string().min(1).max(1000),
});

const AiEditProposalRequestSchema = z.object({
  document: PresentationDocumentSchema,
  pointers: z.array(SlidePointerRequestSchema).max(25),
  prompt: z.string().trim().min(1).max(4000),
  selectedElementId: z.string().min(1).optional(),
  slideId: z.string().min(1),
});

export async function POST(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
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
    const providerContext = await loadProviderContext(userId);
    const routing = await resolveAiEditRouting({
      ...providerContext,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key",
      mode: aiProviderModeFromEnv(process.env),
      presentationId,
      prompt: buildRoutingPrompt(parsed.data),
      remainingBudget: null,
      remainingTokens: null,
      userId,
    });
    const operationId = randomUUID();
    const proposalInput = {
      document: parsed.data.document,
      model: routing.decision.model,
      operationId,
      pointers: parsed.data.pointers,
      prompt: parsed.data.prompt,
      provider: routing.decision.provider,
      slideId: parsed.data.slideId,
      usage: routing.usage,
      ...(parsed.data.selectedElementId
        ? { selectedElementId: parsed.data.selectedElementId }
        : {}),
    };
    const proposal = createPointerDrivenEditProposal(proposalInput);

    await prisma.aiOperation.create({
      data: {
        id: operationId,
        ownerId: userId,
        presentationId,
        slideId: parsed.data.slideId,
        taskType: "SLIDE_REVISION",
        provider: routing.decision.provider,
        model: routing.decision.model,
        routingReason: routing.decision.reason,
        inputTokens: proposal.metadata.usage.inputTokens,
        outputTokens: proposal.metadata.usage.outputTokens,
        estimatedCost: routing.decision.estimatedCost.displayCost,
        status: "SUCCEEDED",
        promptVersion: proposal.metadata.promptVersion,
        schemaVersion: parsed.data.document.schemaVersion,
      },
    });

    return ok(proposal);
  } catch (error) {
    if (error instanceof AiRoutingConfigurationError) {
      return fail(error.code, error.message, error.status);
    }

    return fail(
      "PROPOSAL_FAILED",
      error instanceof Error ? error.message : "AI edit proposal could not be created.",
      400,
    );
  }
}

async function loadProviderContext(userId: string) {
  const [credentials, configurations] = await Promise.all([
    prisma.providerCredential.findMany({
      where: { userId, enabled: true },
      select: {
        provider: true,
        enabled: true,
        ciphertext: true,
        nonce: true,
        authTag: true,
        keyVersion: true,
        maskedValue: true,
      },
    }),
    prisma.providerConfiguration.findMany({
      where: { userId, enabled: true },
      select: {
        provider: true,
        enabled: true,
        baseUrl: true,
        defaultModel: true,
      },
    }),
  ]);

  return { credentials, configurations };
}

function buildRoutingPrompt(input: z.infer<typeof AiEditProposalRequestSchema>): string {
  const slide = input.document.slides.find((candidate) => candidate.id === input.slideId);
  return JSON.stringify({
    task: "SLIDE_REVISION",
    prompt: input.prompt,
    slide,
    pointers: input.pointers,
    selectedElementId: input.selectedElementId ?? null,
  });
}
