import type {
  AiProvider,
  CredentialValidationResult,
  ProviderContext,
  ProviderCredentialInput,
  ProviderModel,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
  UsageEstimate
} from "@slide-agent/ai-core";

function estimateFromPrompt(prompt: string, maxOutputTokens: number): UsageEstimate {
  return {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: maxOutputTokens,
    imageGenerations: 0
  };
}

abstract class BaseProvider implements AiProvider {
  abstract id: string;
  protected abstract models: ProviderModel[];

  async validateCredential(input: ProviderCredentialInput): Promise<CredentialValidationResult> {
    if (!input.apiKey && this.id !== "local-openai-compatible") {
      return { valid: false, errorCategory: "AUTHENTICATION_FAILED" };
    }
    const maskedIdentifier = input.apiKey ? `${input.apiKey.slice(0, 3)}••••${input.apiKey.slice(-4)}` : input.baseUrl;
    return maskedIdentifier ? { valid: true, maskedIdentifier } : { valid: true };
  }

  async listAvailableModels(_context: ProviderContext): Promise<ProviderModel[]> {
    return this.models;
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    return {
      text: `Mock ${this.id} response for ${request.model}`,
      usage: estimateFromPrompt(request.prompt, request.maxOutputTokens),
      finishReason: "stop"
    };
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const parsed = request.schema.parse({});
    return {
      value: parsed,
      usage: estimateFromPrompt(request.prompt, request.maxOutputTokens),
      finishReason: "stop"
    };
  }

  async estimateUsage(request: TextGenerationRequest): Promise<UsageEstimate> {
    return estimateFromPrompt(request.prompt, request.maxOutputTokens);
  }
}

export class OpenAiProvider extends BaseProvider {
  id = "openai";
  protected models: ProviderModel[] = [
    {
      provider: this.id,
      model: "gpt-4.1",
      displayLabel: "OpenAI reasoning and structured output",
      contextSize: 1_000_000,
      structuredOutput: true,
      vision: true,
      imageGeneration: false,
      qualityTier: "high",
      latencyTier: "standard"
    },
    {
      provider: this.id,
      model: "gpt-image-1",
      displayLabel: "OpenAI image generation",
      contextSize: 32000,
      structuredOutput: false,
      vision: true,
      imageGeneration: true,
      qualityTier: "high",
      latencyTier: "slow"
    }
  ];
}

export class AnthropicProvider extends BaseProvider {
  id = "anthropic";
  protected models: ProviderModel[] = [
    {
      provider: this.id,
      model: "claude-3-5-sonnet",
      displayLabel: "Claude structured writing",
      contextSize: 200000,
      structuredOutput: true,
      vision: true,
      imageGeneration: false,
      qualityTier: "high",
      latencyTier: "standard"
    }
  ];
}

export class GeminiProvider extends BaseProvider {
  id = "gemini";
  protected models: ProviderModel[] = [
    {
      provider: this.id,
      model: "gemini-1.5-pro",
      displayLabel: "Gemini long-context multimodal",
      contextSize: 1_000_000,
      structuredOutput: true,
      vision: true,
      imageGeneration: false,
      qualityTier: "high",
      latencyTier: "standard"
    }
  ];
}

export class LocalOpenAiCompatibleProvider extends BaseProvider {
  id = "local-openai-compatible";
  protected models: ProviderModel[] = [
    {
      provider: this.id,
      model: "local-default",
      displayLabel: "Local OpenAI-compatible model",
      contextSize: 32768,
      structuredOutput: false,
      vision: false,
      imageGeneration: false,
      qualityTier: "standard",
      latencyTier: "low"
    }
  ];
}

export function createDefaultProviders(): AiProvider[] {
  return [new OpenAiProvider(), new AnthropicProvider(), new GeminiProvider(), new LocalOpenAiCompatibleProvider()];
}
