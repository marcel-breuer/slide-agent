import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AiProvider, TextGenerationRequest } from "@slide-agent/ai-core";
import { ProviderExecutionError } from "@slide-agent/ai-providers";
import { createPointerDrivenEditProposal } from "@slide-agent/editor-core";
import { ensureDemoPresentation, findPresentationDocument, prisma } from "@slide-agent/database";
import {
  DEMO_PRESENTATION_ID,
  ColorSchema,
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
import { assertBillingQuota, BillingQuotaError, billingQuotaErrorDetails } from "../../../../../lib/billing";
import { budgetRoutingLimits, loadBudgetUsageSnapshot } from "../../../../../lib/budget-usage";
import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { canAccess, getPresentationAccess } from "../../../../../lib/team-access";

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
  targetElementId: z.string().min(1).optional(),
});

const AiEditProposalRequestSchema = z.object({
  document: PresentationDocumentSchema,
  pointers: z.array(SlidePointerRequestSchema).max(25),
  prompt: z.string().trim().min(1).max(4000),
  selectedElementId: z.string().min(1).optional(),
  slideId: z.string().min(1),
});

const GeneratedCommandSchema = z.discriminatedUnion("type", [
  z.object({
    color: ColorSchema,
    slideId: z.string().min(1),
    type: z.literal("UPDATE_SLIDE_BACKGROUND"),
  }),
  z.object({
    elementId: z.string().min(1),
    fill: ColorSchema,
    slideId: z.string().min(1),
    type: z.literal("UPDATE_SHAPE_FILL"),
  }),
  z.object({
    slideId: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    type: z.literal("RENAME_SLIDE"),
  }),
]);

const GeneratedProposalSchema = z.object({
  command: GeneratedCommandSchema,
  summary: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(120),
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
  if (!canAccess(await getPresentationAccess(presentationId, userId), "edit")) {
    return fail("FORBIDDEN", "You do not have permission to edit this presentation.", 403);
  }

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

  const requestedSlide = parsed.data.document.slides.find(
    (slide) => slide.id === parsed.data.slideId,
  );
  if (!requestedSlide) {
    return fail("VALIDATION_FAILED", "Requested slide does not belong to the presentation.", 400);
  }

  const pointersAreScoped = parsed.data.pointers.every(
    (pointer) =>
      pointer.slideId === requestedSlide.id &&
      (!pointer.targetElementId ||
        requestedSlide.elements.some((element) => element.id === pointer.targetElementId)),
  );
  if (!pointersAreScoped) {
    return fail("VALIDATION_FAILED", "Pointer references must belong to the requested slide.", 400);
  }

  try {
    await assertBillingQuota(userId, "generations");
    const budgetSnapshot = await loadBudgetUsageSnapshot(userId);
    if (budgetSnapshot.usage.hardStopReached) {
      return fail(
        "BUDGET_LIMIT_REACHED",
        "Monthly budget limits are reached. Update budget settings or wait until the next month.",
        409,
      );
    }

    const providerContext = await loadProviderContext(userId);
    const routingLimits = budgetRoutingLimits(budgetSnapshot);
    const routing = await resolveAiEditRouting({
      ...providerContext,
      encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key",
      mode: aiProviderModeFromEnv(process.env),
      presentationId,
      prompt: buildRoutingPrompt(parsed.data),
      remainingBudget: routingLimits.remainingBudget,
      remainingTokens: routingLimits.remainingTokens,
      userId,
    });
    const operationId = randomUUID();
    const providerResult =
      routing.mode === "configured"
        ? await generateProviderProposal(
            routing.provider,
            routing.decision.model,
            parsed.data,
            request.signal,
          )
        : null;
    const proposal = providerResult
      ? createProviderProposal({
          generated: providerResult.value,
          operationId,
          presentation: parsed.data.document,
          model: routing.decision.model,
          provider: routing.decision.provider,
          slideId: parsed.data.slideId,
          usage: providerResult.usage,
          pointers: parsed.data.pointers,
        })
      : createPointerDrivenEditProposal({
          document: parsed.data.document,
          model: routing.decision.model,
          operationId,
          pointers: parsed.data.pointers.map((pointer) => ({
            id: pointer.id,
            instruction: pointer.instruction,
            label: pointer.label,
            slideId: pointer.slideId,
            ...(pointer.targetElementId ? { targetElementId: pointer.targetElementId } : {}),
            x: pointer.x,
            y: pointer.y,
          })),
          prompt: parsed.data.prompt,
          provider: routing.decision.provider,
          slideId: parsed.data.slideId,
          usage: routing.usage,
          ...(parsed.data.selectedElementId
            ? { selectedElementId: parsed.data.selectedElementId }
            : {}),
        });

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
    if (error instanceof BillingQuotaError) return fail(...billingQuotaErrorDetails(error));
    if (error instanceof AiRoutingConfigurationError) {
      return fail(error.code, error.message, error.status);
    }

    if (error instanceof ProviderExecutionError) {
      return fail(...providerErrorResponse(error));
    }

    if (error instanceof Error && error.message.includes("budget constraints")) {
      return fail(
        "BUDGET_LIMIT_REACHED",
        "No available model can run within the remaining monthly budget limits.",
        409,
      );
    }

    return fail(
      "PROPOSAL_FAILED",
      error instanceof Error ? error.message : "AI edit proposal could not be created.",
      400,
    );
  }
}

async function generateProviderProposal(
  provider: AiProvider | undefined,
  model: string,
  input: z.infer<typeof AiEditProposalRequestSchema>,
  signal: NonNullable<TextGenerationRequest["signal"]>,
) {
  if (!provider) {
    throw new ProviderExecutionError("PROVIDER_UNAVAILABLE", "No configured provider is available.");
  }

  return provider.generateStructured({
    maxOutputTokens: maxOutputTokensFromEnv(process.env.AI_MAX_OUTPUT_TOKENS),
    model,
    prompt: buildProviderPrompt(input),
    schema: GeneratedProposalSchema,
    signal,
  });
}

function createProviderProposal(input: {
  generated: z.infer<typeof GeneratedProposalSchema>;
  model: string;
  operationId: string;
  presentation: z.infer<typeof PresentationDocumentSchema>;
  provider: string;
  slideId: string;
  usage: { inputTokens: number; outputTokens: number; imageGenerations: number };
  pointers: readonly z.infer<typeof SlidePointerRequestSchema>[];
}) {
  const slide = input.presentation.slides.find((candidate) => candidate.id === input.slideId);
  if (!slide || input.generated.command.slideId !== input.slideId) {
    throw new ProviderExecutionError(
      "INVALID_REQUEST",
      "The provider returned a command outside the requested slide.",
    );
  }

  const command = input.generated.command;
  if (command.type === "UPDATE_SHAPE_FILL") {
    const element = slide.elements.find((candidate) => candidate.id === command.elementId);
    if (!element || element.type !== "shape" || element.locked) {
      throw new ProviderExecutionError(
        "INVALID_REQUEST",
        "The provider returned a command for an invalid or locked element.",
      );
    }
  }

  return {
    id: input.operationId,
    title: input.generated.title,
    summary: input.generated.summary,
    slideId: input.slideId,
    pointerIds: input.pointers.filter((pointer) => pointer.slideId === input.slideId).map((pointer) => pointer.id),
    commands: [
      {
        command: input.generated.command,
        description: input.generated.summary,
      },
    ],
    metadata: {
      operationId: input.operationId,
      promptVersion: "provider-edit-v1",
      generatedAt: new Date().toISOString(),
      provider: input.provider,
      model: input.model,
      usage: input.usage,
    },
  };
}

function buildProviderPrompt(input: z.infer<typeof AiEditProposalRequestSchema>): string {
  return [
    buildRoutingPrompt(input),
    "Return one safe, schema-valid edit proposal as JSON with title, summary, and command.",
    "Allowed command types are UPDATE_SLIDE_BACKGROUND, UPDATE_SHAPE_FILL, and RENAME_SLIDE.",
    "The command must target the requested slide. Never invent element ids, change locked elements, execute code, or return markdown.",
  ].join("\n\n");
}

function maxOutputTokensFromEnv(value: string | undefined): number {
  const parsed = Number(value ?? 800);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
}

function providerErrorResponse(error: ProviderExecutionError): [string, string, number] {
  switch (error.category) {
    case "AUTHENTICATION_FAILED":
      return ["AI_PROVIDER_AUTHENTICATION_FAILED", "The configured AI provider rejected its credential.", 502];
    case "RATE_LIMITED":
      return ["AI_PROVIDER_RATE_LIMITED", "The AI provider is rate-limiting requests. Please try again later.", 429];
    case "TIMEOUT":
      return ["AI_PROVIDER_TIMEOUT", "The AI provider did not respond within the configured timeout.", 504];
    case "CANCELLED":
      return ["AI_REQUEST_CANCELLED", "The AI provider request was cancelled.", 499];
    case "INVALID_REQUEST":
      return ["AI_PROVIDER_RESPONSE_INVALID", "The AI provider returned an invalid structured response.", 502];
    case "MODEL_UNAVAILABLE":
      return ["AI_PROVIDER_MODEL_UNAVAILABLE", "The selected AI model is currently unavailable.", 503];
    default:
      return ["AI_PROVIDER_UNAVAILABLE", "The configured AI provider is currently unavailable.", 503];
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
