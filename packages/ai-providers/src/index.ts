import type {
  AiProvider,
  CredentialValidationResult,
  ProviderContext,
  ProviderCredentialInput,
  ProviderErrorCategory,
  ProviderModel,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
  UsageEstimate,
} from "@slide-agent/ai-core";

export type ProviderRuntimeOptions = {
  credential?: ProviderCredentialInput;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
};

export class ProviderExecutionError extends Error {
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    category: ProviderErrorCategory,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ProviderExecutionError";
    this.category = category;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

type ProviderResponse = {
  body: unknown;
  status: number;
};

function estimateFromPrompt(prompt: string, maxOutputTokens: number): UsageEstimate {
  return {
    inputTokens: Math.max(1, Math.ceil(prompt.length / 4)),
    outputTokens: Math.max(1, maxOutputTokens),
    imageGenerations: 0,
  };
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function usageFromProviderResponse(
  usage: unknown,
  prompt: string,
  maxOutputTokens: number,
): UsageEstimate {
  const record = asRecord(usage);
  return {
    inputTokens: numberOrFallback(
      record.input_tokens ?? record.prompt_tokens ?? record.promptTokenCount,
      estimateFromPrompt(prompt, maxOutputTokens).inputTokens,
    ),
    outputTokens: numberOrFallback(
      record.output_tokens ?? record.completion_tokens ?? record.candidatesTokenCount,
      maxOutputTokens,
    ),
    imageGenerations: 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finishReason(value: unknown): TextGenerationResult["finishReason"] {
  if (value === "length" || value === "max_tokens") return "length";
  if (value === "content_filter" || value === "safety") return "content_filter";
  return "stop";
}

function providerErrorForStatus(status: number): ProviderExecutionError {
  if (status === 401 || status === 403) {
    return new ProviderExecutionError("AUTHENTICATION_FAILED", "The provider rejected the credential.", {
      retryable: false,
      status,
    });
  }
  if (status === 408 || status === 504) {
    return new ProviderExecutionError("TIMEOUT", "The provider request timed out.", {
      retryable: true,
      status,
    });
  }
  if (status === 429) {
    return new ProviderExecutionError("RATE_LIMITED", "The provider rate limit was reached.", {
      retryable: true,
      status,
    });
  }
  if (status === 400 || status === 422) {
    return new ProviderExecutionError("INVALID_REQUEST", "The provider rejected the request.", {
      retryable: false,
      status,
    });
  }
  if (status === 404) {
    return new ProviderExecutionError("MODEL_UNAVAILABLE", "The requested provider model is unavailable.", {
      retryable: false,
      status,
    });
  }
  return new ProviderExecutionError("PROVIDER_UNAVAILABLE", "The provider request failed.", {
    retryable: status >= 500,
    status,
  });
}

function parseJsonText(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new ProviderExecutionError(
      "INVALID_REQUEST",
      "The provider returned malformed structured data.",
      { retryable: false },
    );
  }
}

abstract class BaseProvider implements AiProvider {
  abstract id: string;
  protected abstract models: ProviderModel[];
  protected readonly credential: ProviderCredentialInput;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: ProviderRuntimeOptions = {}) {
    this.credential = options.credential ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 150);
    this.defaultTimeoutMs = Math.max(100, options.timeoutMs ?? 30_000);
  }

  async validateCredential(input: ProviderCredentialInput): Promise<CredentialValidationResult> {
    if (!input.apiKey && this.id !== "local-openai-compatible") {
      return { valid: false, errorCategory: "AUTHENTICATION_FAILED" };
    }
    const maskedIdentifier = input.apiKey
      ? `${input.apiKey.slice(0, 3)}••••${input.apiKey.slice(-4)}`
      : input.baseUrl;
    return maskedIdentifier ? { valid: true, maskedIdentifier } : { valid: true };
  }

  async listAvailableModels(_context: ProviderContext): Promise<ProviderModel[]> {
    return this.models;
  }

  abstract generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const result = await this.generateText({
      maxOutputTokens: request.maxOutputTokens,
      model: request.model,
      prompt: [
        request.prompt,
        "Return only valid JSON matching the requested schema. Do not include markdown fences or commentary.",
      ].join("\n\n"),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
    });
    const value = request.schema.safeParse(parseJsonText(result.text));
    if (!value.success) {
      throw new ProviderExecutionError(
        "INVALID_REQUEST",
        "The provider response did not match the requested presentation schema.",
        { retryable: false },
      );
    }
    return { ...result, value: value.data };
  }

  async estimateUsage(request: TextGenerationRequest): Promise<UsageEstimate> {
    return estimateFromPrompt(request.prompt, request.maxOutputTokens);
  }

  protected async requestJson(
    url: string,
    init: Parameters<typeof fetch>[1],
    request: Pick<TextGenerationRequest, "signal" | "timeoutMs">,
  ): Promise<ProviderResponse> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    if (request.signal?.aborted) {
      throw new ProviderExecutionError("CANCELLED", "The provider request was cancelled.", {
        retryable: false,
      });
    }

    const controller = new globalThis.AbortController();
    let didTimeout = false;
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        try {
          const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
          const rawBody = await response.text();
          let body: unknown = null;
          try {
            body = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            body = null;
          }
          if (response.ok) return { body, status: response.status };

          const error = providerErrorForStatus(response.status);
          if (!error.retryable || attempt === this.maxRetries) throw error;
          await delay(this.retryBaseDelayMs * 2 ** attempt);
        } catch (error) {
          if (error instanceof ProviderExecutionError) throw error;
          if (didTimeout) {
            throw new ProviderExecutionError("TIMEOUT", "The provider request timed out.", {
              retryable: false,
            });
          }
          if (request.signal?.aborted) {
            throw new ProviderExecutionError("CANCELLED", "The provider request was cancelled.", {
              retryable: false,
            });
          }
          if (attempt === this.maxRetries) {
            throw new ProviderExecutionError("NETWORK_ERROR", "The provider could not be reached.", {
              retryable: false,
            });
          }
          await delay(this.retryBaseDelayMs * 2 ** attempt);
        }
      }
    } finally {
      globalThis.clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
    throw new ProviderExecutionError("UNKNOWN", "The provider request failed.");
  }

  protected apiKey(): string {
    if (!this.credential.apiKey) {
      throw new ProviderExecutionError("AUTHENTICATION_FAILED", "A provider credential is required.");
    }
    return this.credential.apiKey;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
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
      latencyTier: "standard",
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
      latencyTier: "slow",
    },
  ];

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const response = await this.requestJson(
      `${this.credential.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`,
      {
        body: JSON.stringify({
          messages: [{ content: request.prompt, role: "user" }],
          model: request.model,
          max_tokens: request.maxOutputTokens,
        }),
        headers: {
          Authorization: `Bearer ${this.apiKey()}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      request,
    );
    const choices = asRecord(response.body).choices;
    const choice = Array.isArray(choices) ? choices[0] : undefined;
    const message = asRecord(choice?.message);
    const text = asText(message.content);
    if (!text) {
      throw new ProviderExecutionError("UNKNOWN", "The provider returned no text content.");
    }
    return {
      finishReason: finishReason(choice?.finish_reason),
      text,
      usage: usageFromProviderResponse(asRecord(response.body).usage, request.prompt, request.maxOutputTokens),
    };
  }
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
      latencyTier: "standard",
    },
  ];

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const response = await this.requestJson(
      `${this.credential.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      {
        body: JSON.stringify({
          max_tokens: request.maxOutputTokens,
          messages: [{ content: request.prompt, role: "user" }],
          model: request.model,
        }),
        headers: {
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey(),
        },
        method: "POST",
      },
      request,
    );
    const content = asRecord(response.body).content;
    const text = Array.isArray(content)
      ? content.map((entry) => asText(asRecord(entry).text)).filter(Boolean).join("\n")
      : null;
    if (!text) throw new ProviderExecutionError("UNKNOWN", "The provider returned no text content.");
    return {
      finishReason: finishReason(asRecord(response.body).stop_reason),
      text,
      usage: usageFromProviderResponse(asRecord(response.body).usage, request.prompt, request.maxOutputTokens),
    };
  }
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
      latencyTier: "standard",
    },
  ];

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const baseUrl = this.credential.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const response = await this.requestJson(
      `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.apiKey())}`,
      {
        body: JSON.stringify({
          contents: [{ parts: [{ text: request.prompt }], role: "user" }],
          generationConfig: { maxOutputTokens: request.maxOutputTokens },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      request,
    );
    const candidates = asRecord(response.body).candidates;
    const candidate = Array.isArray(candidates) ? candidates[0] : undefined;
    const parts = asRecord(candidate?.content).parts;
    const text = Array.isArray(parts)
      ? parts.map((entry) => asText(asRecord(entry).text)).filter(Boolean).join("\n")
      : null;
    if (!text) throw new ProviderExecutionError("UNKNOWN", "The provider returned no text content.");
    return {
      finishReason: finishReason(candidate?.finishReason),
      text,
      usage: usageFromProviderResponse(
        asRecord(response.body).usageMetadata,
        request.prompt,
        request.maxOutputTokens,
      ),
    };
  }
}

export class LocalOpenAiCompatibleProvider extends OpenAiProvider {
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
      latencyTier: "low",
    },
  ];

  async validateCredential(input: ProviderCredentialInput): Promise<CredentialValidationResult> {
    return input.baseUrl ? { valid: true, maskedIdentifier: input.baseUrl } : { valid: false, errorCategory: "INVALID_REQUEST" };
  }
}

export function createDefaultProviders(
  credentials: Readonly<Record<string, ProviderCredentialInput>> = {},
  runtime: Omit<ProviderRuntimeOptions, "credential"> = {},
): AiProvider[] {
  const optionsFor = (provider: string): ProviderRuntimeOptions =>
    credentials[provider]
      ? { ...runtime, credential: credentials[provider] }
      : { ...runtime };
  return [
    new OpenAiProvider(optionsFor("openai")),
    new AnthropicProvider(optionsFor("anthropic")),
    new GeminiProvider(optionsFor("gemini")),
    new LocalOpenAiCompatibleProvider(optionsFor("local-openai-compatible")),
  ];
}
