import { describe, expect, it } from "vitest";

import { encryptCredential } from "@slide-agent/auth";

import {
  aiProviderModeFromEnv,
  resolveAiEditRouting,
  type AiRoutingConfigurationError,
  type StoredProviderCredential,
} from "./ai-provider-routing";

describe("AI provider routing", () => {
  it("defaults to deterministic mock mode unless configured mode is explicit", () => {
    expect(aiProviderModeFromEnv({})).toBe("mock");
    expect(aiProviderModeFromEnv({ AI_PROVIDER_MODE: "configured" })).toBe("configured");
  });

  it("routes deterministic mock proposals through the model router", async () => {
    const routing = await resolveAiEditRouting({
      configurations: [],
      credentials: [],
      encryptionKey: "local-dev-encryption-key",
      mode: "mock",
      presentationId: "demo-presentation",
      prompt: "Use #f8fafc near pointer 1.",
      remainingBudget: null,
      remainingTokens: null,
      userId: "demo-user",
    });

    expect(routing.decision.provider).toBe("mock");
    expect(routing.decision.model).toBe("deterministic-pointer-proposal");
    expect(routing.usage.inputTokens).toBeGreaterThan(0);
  });

  it("returns a clear configuration error when configured mode has no credentials", async () => {
    await expect(
      resolveAiEditRouting({
        configurations: [],
        credentials: [],
        encryptionKey: "local-dev-encryption-key",
        mode: "configured",
        presentationId: "demo-presentation",
        prompt: "Use #f8fafc near pointer 1.",
        remainingBudget: null,
        remainingTokens: null,
        userId: "demo-user",
      }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_NOT_CONFIGURED",
      status: 409,
    } satisfies Partial<AiRoutingConfigurationError>);
  });

  it("routes configured provider credentials to a structured output model", async () => {
    const encrypted = encryptCredential("sk-test-secret-AB12", "local-dev-encryption-key");
    const credential: StoredProviderCredential = {
      authTag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      enabled: true,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      nonce: encrypted.nonce,
      provider: "openai",
    };
    const routing = await resolveAiEditRouting({
      configurations: [
        { baseUrl: null, defaultModel: "gpt-4.1", enabled: true, provider: "openai" },
      ],
      credentials: [credential],
      encryptionKey: "local-dev-encryption-key",
      mode: "configured",
      presentationId: "demo-presentation",
      prompt: "Use #f8fafc near pointer 1.",
      remainingBudget: null,
      remainingTokens: null,
      userId: "demo-user",
    });

    expect(routing.decision.provider).toBe("openai");
    expect(routing.decision.model).toBe("gpt-4.1");
    expect(routing.decision.estimatedCost.totalTokens).toBeGreaterThan(0);
  });
});
