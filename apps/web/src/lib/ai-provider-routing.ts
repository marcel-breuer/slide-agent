import type {
  AiProvider,
  RoutingDecision,
  RoutingModelPolicy,
  UsageEstimate,
} from "@slide-agent/ai-core";
import { routeModel } from "@slide-agent/ai-core";
import { createDefaultProviders } from "@slide-agent/ai-providers";
import { decryptCredential, type EncryptedCredential } from "@slide-agent/auth";
import {
  estimateCost,
  type CostEstimate,
  type Currency,
  type PricingEntry,
} from "@slide-agent/pricing";

export type AiProviderMode = "configured" | "mock";

export type StoredProviderCredential = {
  provider: string;
  enabled: boolean;
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
  maskedValue: string;
};

export type StoredProviderConfiguration = {
  provider: string;
  enabled: boolean;
  baseUrl: string | null;
  defaultModel: string | null;
};

export type AiEditRoutingRequest = {
  credentials: readonly StoredProviderCredential[];
  configurations: readonly StoredProviderConfiguration[];
  encryptionKey: string;
  localOnly?: boolean;
  mode: AiProviderMode;
  presentationId: string;
  prompt: string;
  remainingBudget: number | null;
  remainingTokens: number | null;
  requestedQuality?: "low" | "standard" | "high";
  userId: string;
};

export type AiEditRoutingResult = {
  decision: RoutingDecision;
  mode: AiProviderMode;
  provider: AiProvider | undefined;
  usage: UsageEstimate;
};

export class AiRoutingConfigurationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AiRoutingConfigurationError";
  }
}

const mockEstimate: CostEstimate = {
  providerCost: 0,
  displayCost: 0,
  providerCurrency: "USD",
  displayCurrency: "EUR",
  totalTokens: 1,
  uncertaintyLow: 0,
  uncertaintyHigh: 0,
};

const mockPolicy: RoutingModelPolicy = {
  active: true,
  contextSize: 128000,
  displayLabel: "Deterministic proposal provider",
  imageGeneration: false,
  latencyTier: "low",
  local: true,
  model: "deterministic-pointer-proposal",
  priority: 1,
  provider: "mock",
  qualityTier: "standard",
  structuredOutput: true,
  vision: false,
};

export function aiProviderModeFromEnv(env: Record<string, string | undefined>): AiProviderMode {
  return env.AI_PROVIDER_MODE === "configured" ? "configured" : "mock";
}

export async function resolveAiEditRouting(
  input: AiEditRoutingRequest,
): Promise<AiEditRoutingResult> {
  if (input.mode === "mock") {
    const usage = estimateUsageFromPrompt(
      input.prompt,
      maxOutputTokensFromEnv(process.env.AI_MAX_OUTPUT_TOKENS),
    );
    return {
      decision: routeModel(
        {
          taskType: "SLIDE_REVISION",
          userId: input.userId,
          presentationId: input.presentationId,
          requestedQuality: input.requestedQuality ?? "standard",
          estimatedContextSize: usage.inputTokens,
          requiresStructuredOutput: true,
          requiresVision: false,
          requiresImageGeneration: false,
          configuredProviders: ["mock"],
          remainingBudget: input.remainingBudget,
          remainingTokens: input.remainingTokens,
          providerHealth: { mock: "healthy" },
          retryAttempt: 0,
          localOnly: true,
          estimates: {
            "mock:deterministic-pointer-proposal": {
              ...mockEstimate,
              totalTokens: usage.inputTokens + usage.outputTokens,
            },
          },
        },
        [mockPolicy],
      ),
      mode: "mock",
      provider: undefined,
      usage,
    };
  }

  const providerIds = createDefaultProviders().map((provider) => provider.id);
  const enabledCredentials = input.credentials.filter(
    (credential) => credential.enabled && providerIds.includes(credential.provider),
  );
  const enabledConfigurations = new Map(
    input.configurations
      .filter((configuration) => configuration.enabled)
      .map((configuration) => [configuration.provider, configuration]),
  );
  const providerCredentials = Object.fromEntries(
    enabledCredentials.map((credential) => {
      const configuration = enabledConfigurations.get(credential.provider);
      return [
        credential.provider,
        {
          apiKey: decryptCredential(toEncryptedCredential(credential), input.encryptionKey),
          ...(configuration?.baseUrl ? { baseUrl: configuration.baseUrl } : {}),
        },
      ];
    }),
  );
  const providers = createDefaultProviders(providerCredentials, {
    maxRetries: positiveIntegerFromEnv(process.env.AI_PROVIDER_MAX_RETRIES, 2),
    timeoutMs: positiveIntegerFromEnv(process.env.AI_PROVIDER_TIMEOUT_MS, 30_000),
  });
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  if (enabledCredentials.length === 0) {
    throw new AiRoutingConfigurationError(
      "AI_PROVIDER_NOT_CONFIGURED",
      "Configure at least one AI provider before requesting an edit proposal.",
      409,
    );
  }

  const validatedProviders: AiProvider[] = [];
  for (const credential of enabledCredentials) {
    const provider = providerById.get(credential.provider);
    if (!provider) continue;

    const providerCredential = providerCredentials[credential.provider];
    const validation = await provider.validateCredential({
      ...providerCredential,
    });

    if (!validation.valid) {
      throw new AiRoutingConfigurationError(
        "AI_PROVIDER_CREDENTIAL_INVALID",
        `${credential.provider} credentials are not valid.`,
        409,
      );
    }

    validatedProviders.push(provider);
  }

  if (validatedProviders.length === 0) {
    throw new AiRoutingConfigurationError(
      "AI_PROVIDER_NOT_CONFIGURED",
      "No enabled AI provider is available for edit proposals.",
      409,
    );
  }

  const usage = estimateUsageFromPrompt(
    input.prompt,
    maxOutputTokensFromEnv(process.env.AI_MAX_OUTPUT_TOKENS),
  );
  const policies = await buildRoutingPolicies(
    validatedProviders,
    enabledConfigurations,
    input.userId,
    input.presentationId,
  );
  const estimates = buildEstimates(
    policies,
    usage,
    envCurrency(process.env.DEFAULT_CURRENCY),
    Number(process.env.USD_TO_EUR_EXCHANGE_RATE ?? 0.92),
  );
  const configuredProviders = validatedProviders.map((provider) => provider.id);
  const providerHealth = Object.fromEntries(
    configuredProviders.map((provider) => [provider, "healthy" as const]),
  );

  const decision = routeModel(
    {
      taskType: "SLIDE_REVISION",
      userId: input.userId,
      presentationId: input.presentationId,
      requestedQuality: input.requestedQuality ?? "standard",
      estimatedContextSize: usage.inputTokens,
      requiresStructuredOutput: true,
      requiresVision: false,
      requiresImageGeneration: false,
      configuredProviders,
      remainingBudget: input.remainingBudget,
      remainingTokens: input.remainingTokens,
      providerHealth,
      retryAttempt: 0,
      localOnly: input.localOnly ?? false,
      estimates,
    },
    policies,
  );
  return {
    decision,
    mode: "configured",
    provider: providerById.get(decision.provider),
    usage,
  };
}

async function buildRoutingPolicies(
  providers: readonly AiProvider[],
  configurations: ReadonlyMap<string, StoredProviderConfiguration>,
  userId: string,
  presentationId: string,
): Promise<RoutingModelPolicy[]> {
  const policies: RoutingModelPolicy[] = [];

  for (const [providerIndex, provider] of providers.entries()) {
    const models = await provider.listAvailableModels({ userId, presentationId });
    const configuration = configurations.get(provider.id);
    for (const [modelIndex, model] of models.entries()) {
      policies.push({
        ...model,
        active: true,
        local: provider.id === "local-openai-compatible",
        priority:
          model.model === configuration?.defaultModel
            ? providerIndex * 100
            : providerIndex * 100 + modelIndex + 1,
      });
    }
  }

  return policies;
}

function buildEstimates(
  policies: readonly RoutingModelPolicy[],
  usage: UsageEstimate,
  displayCurrency: Currency,
  usdToEurRate: number,
): Record<string, CostEstimate> {
  return Object.fromEntries(
    policies.map((policy) => {
      const pricing = pricingForPolicy(policy);
      return [
        `${policy.provider}:${policy.model}`,
        estimateCost(
          pricing,
          {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            imageGenerations: usage.imageGenerations,
          },
          displayCurrency,
          usdToEurRate,
        ),
      ];
    }),
  );
}

function pricingForPolicy(policy: RoutingModelPolicy): PricingEntry {
  if (policy.imageGeneration) {
    return {
      active: true,
      currency: "USD",
      effectiveDate: new Date(0).toISOString(),
      imageGenerationUnit: 0.04,
      inputPerMillion: 5,
      model: policy.model,
      outputPerMillion: 15,
      provider: policy.provider,
    };
  }

  return {
    active: true,
    currency: "USD",
    effectiveDate: new Date(0).toISOString(),
    imageGenerationUnit: 0,
    inputPerMillion: policy.qualityTier === "high" ? 5 : 1,
    model: policy.model,
    outputPerMillion: policy.qualityTier === "high" ? 15 : 3,
    provider: policy.provider,
  };
}

function estimateUsageFromPrompt(prompt: string, maxOutputTokens: number): UsageEstimate {
  return {
    inputTokens: Math.max(1, Math.ceil(prompt.length / 4)),
    outputTokens: Math.max(1, maxOutputTokens),
    imageGenerations: 0,
  };
}

function maxOutputTokensFromEnv(value: string | undefined): number {
  const parsed = Number(value ?? 800);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
}

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function envCurrency(value: string | undefined): Currency {
  return value === "USD" ? "USD" : "EUR";
}

function toEncryptedCredential(credential: StoredProviderCredential): EncryptedCredential {
  return {
    algorithm: "aes-256-gcm",
    authTag: credential.authTag,
    ciphertext: credential.ciphertext,
    keyVersion: credential.keyVersion,
    nonce: credential.nonce,
    metadata: {
      createdAt: new Date(0).toISOString(),
      maskedValue: credential.maskedValue,
    },
  };
}
