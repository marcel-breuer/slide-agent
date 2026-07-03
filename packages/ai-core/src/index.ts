import { z } from "zod";

import type { CostEstimate } from "@slide-agent/pricing";

export const AiTaskTypeSchema = z.enum([
  "BRIEFING_GAP_ANALYSIS",
  "STORYLINE_GENERATION",
  "OUTLINE_GENERATION",
  "SLIDE_CONTENT_GENERATION",
  "SLIDE_LAYOUT_GENERATION",
  "SLIDE_REVISION",
  "TEXT_REWRITE",
  "TEXT_SHORTENING",
  "SPEAKER_NOTES_GENERATION",
  "REFERENCE_ANALYSIS",
  "PPTX_DESIGN_ANALYSIS",
  "IMAGE_ANALYSIS",
  "IMAGE_PROMPT_GENERATION",
  "IMAGE_GENERATION",
  "PRESENTATION_QA",
  "SLIDE_QA",
  "CLASSIFICATION",
  "EMBEDDING",
]);
export type AiTaskType = z.infer<typeof AiTaskTypeSchema>;

export const ProviderErrorCategorySchema = z.enum([
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "BUDGET_EXCEEDED",
  "MODEL_UNAVAILABLE",
  "INVALID_REQUEST",
  "CONTENT_REJECTED",
  "CONTEXT_TOO_LARGE",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "NETWORK_ERROR",
  "UNKNOWN",
]);
export type ProviderErrorCategory = z.infer<typeof ProviderErrorCategorySchema>;

export type ProviderCredentialInput = {
  apiKey?: string;
  baseUrl?: string;
};

export type CredentialValidationResult = {
  valid: boolean;
  maskedIdentifier?: string;
  errorCategory?: ProviderErrorCategory;
};

export type ProviderModel = {
  provider: string;
  model: string;
  displayLabel: string;
  contextSize: number;
  structuredOutput: boolean;
  vision: boolean;
  imageGeneration: boolean;
  qualityTier: "low" | "standard" | "high";
  latencyTier: "low" | "standard" | "slow";
};

export type ProviderContext = {
  userId: string;
  presentationId?: string;
};

export type UsageEstimate = {
  inputTokens: number;
  outputTokens: number;
  imageGenerations: number;
};

export type TextGenerationRequest = {
  model: string;
  prompt: string;
  maxOutputTokens: number;
};

export type TextGenerationResult = {
  text: string;
  usage: UsageEstimate;
  finishReason: "stop" | "length" | "content_filter";
};

export type StructuredGenerationRequest<T> = TextGenerationRequest & {
  schema: z.ZodType<T>;
};

export type StructuredGenerationResult<T> = {
  value: T;
  usage: UsageEstimate;
  finishReason: "stop" | "length" | "content_filter";
};

export type ImageGenerationRequest = {
  model: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
};

export type ImageGenerationResult = {
  assetBytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
  usage: UsageEstimate;
};

export interface AiProvider {
  id: string;
  validateCredential(input: ProviderCredentialInput): Promise<CredentialValidationResult>;
  listAvailableModels(context: ProviderContext): Promise<ProviderModel[]>;
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
  generateImage?(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  estimateUsage(request: TextGenerationRequest): Promise<UsageEstimate>;
}

export type RoutingInput = {
  taskType: AiTaskType;
  userId: string;
  presentationId?: string;
  requestedQuality: "low" | "standard" | "high";
  estimatedContextSize: number;
  requiresStructuredOutput: boolean;
  requiresVision: boolean;
  requiresImageGeneration: boolean;
  maximumAcceptableCost?: number;
  configuredProviders: readonly string[];
  remainingBudget: number | null;
  remainingTokens: number | null;
  providerHealth: Record<string, "healthy" | "degraded" | "down">;
  retryAttempt: number;
  localOnly: boolean;
  estimates: Record<string, CostEstimate>;
};

export type RoutingDecision = {
  provider: string;
  model: string;
  reason: string;
  estimatedCost: CostEstimate;
};

export type RoutingModelPolicy = ProviderModel & {
  priority: number;
  active: boolean;
  local: boolean;
};

function qualityRank(value: "low" | "standard" | "high"): number {
  return value === "high" ? 3 : value === "standard" ? 2 : 1;
}

export function routeModel(
  input: RoutingInput,
  policies: readonly RoutingModelPolicy[],
): RoutingDecision {
  const candidates = policies
    .filter((policy) => policy.active)
    .filter((policy) => input.configuredProviders.includes(policy.provider))
    .filter((policy) => input.providerHealth[policy.provider] !== "down")
    .filter((policy) => policy.contextSize >= input.estimatedContextSize)
    .filter((policy) => !input.requiresStructuredOutput || policy.structuredOutput)
    .filter((policy) => !input.requiresVision || policy.vision)
    .filter((policy) => !input.requiresImageGeneration || policy.imageGeneration)
    .filter((policy) => !input.localOnly || policy.local)
    .filter((policy) => qualityRank(policy.qualityTier) >= qualityRank(input.requestedQuality))
    .map((policy) => ({ policy, estimate: input.estimates[`${policy.provider}:${policy.model}`] }))
    .filter((candidate): candidate is { policy: RoutingModelPolicy; estimate: CostEstimate } =>
      Boolean(candidate.estimate),
    )
    .filter(
      (candidate) =>
        input.remainingBudget === null || candidate.estimate.displayCost <= input.remainingBudget,
    )
    .filter(
      (candidate) =>
        input.remainingTokens === null || candidate.estimate.totalTokens <= input.remainingTokens,
    )
    .filter(
      (candidate) =>
        input.maximumAcceptableCost === undefined ||
        candidate.estimate.displayCost <= input.maximumAcceptableCost,
    )
    .sort((left, right) => {
      if (left.policy.priority !== right.policy.priority)
        return left.policy.priority - right.policy.priority;
      return left.estimate.displayCost - right.estimate.displayCost;
    });

  const selected = candidates[0];
  if (!selected) {
    throw new Error("No configured model satisfies routing, capability, and budget constraints.");
  }

  return {
    provider: selected.policy.provider,
    model: selected.policy.model,
    estimatedCost: selected.estimate,
    reason: `${input.taskType} routed to ${selected.policy.displayLabel} because it satisfies capability, context, quality, availability, and budget constraints.`,
  };
}
