import { describe, expect, it } from "vitest";

import { routeModel, type RoutingModelPolicy } from "./index";

const policies: RoutingModelPolicy[] = [
  {
    provider: "openai",
    model: "fast",
    displayLabel: "Fast structured",
    contextSize: 128000,
    structuredOutput: true,
    vision: false,
    imageGeneration: false,
    qualityTier: "standard",
    latencyTier: "low",
    priority: 10,
    active: true,
    local: false,
  },
  {
    provider: "local",
    model: "local-small",
    displayLabel: "Local small",
    contextSize: 8192,
    structuredOutput: false,
    vision: false,
    imageGeneration: false,
    qualityTier: "low",
    latencyTier: "low",
    priority: 1,
    active: true,
    local: true,
  },
];

describe("model router", () => {
  it("selects a configured model that satisfies structured output and budget", () => {
    const decision = routeModel(
      {
        taskType: "STORYLINE_GENERATION",
        userId: "user_1",
        requestedQuality: "standard",
        estimatedContextSize: 5000,
        requiresStructuredOutput: true,
        requiresVision: false,
        requiresImageGeneration: false,
        configuredProviders: ["openai", "local"],
        remainingBudget: 10,
        remainingTokens: null,
        providerHealth: { openai: "healthy", local: "healthy" },
        retryAttempt: 0,
        localOnly: false,
        estimates: {
          "openai:fast": {
            providerCost: 0.12,
            displayCost: 0.12,
            providerCurrency: "USD",
            displayCurrency: "USD",
            totalTokens: 9000,
            uncertaintyLow: 0.09,
            uncertaintyHigh: 0.16,
          },
        },
      },
      policies,
    );

    expect(decision.provider).toBe("openai");
  });
});
