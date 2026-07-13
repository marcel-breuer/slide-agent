import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AnthropicProvider, GeminiProvider, OpenAiProvider } from "./index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("provider adapters", () => {
  it("executes OpenAI text generation without putting the credential in the body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("gpt-4.1");
      expect(JSON.stringify(body)).not.toContain("sk-test-secret");
      expect(new globalThis.Headers(init?.headers).get("authorization")).toBe("Bearer sk-test-secret");
      return jsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "provider response" } }],
        usage: { completion_tokens: 7, prompt_tokens: 13 },
      });
    });
    const provider = new OpenAiProvider({
      credential: { apiKey: "sk-test-secret", baseUrl: "https://provider.test/v1" },
      fetchImpl,
    });

    await expect(
      provider.generateText({ maxOutputTokens: 80, model: "gpt-4.1", prompt: "Write a title." }),
    ).resolves.toEqual({
      finishReason: "stop",
      text: "provider response",
      usage: { imageGenerations: 0, inputTokens: 13, outputTokens: 7 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("validates structured output and reports malformed provider responses", async () => {
    const provider = new OpenAiProvider({
      credential: { apiKey: "sk-test-secret", baseUrl: "https://provider.test/v1" },
      fetchImpl: vi.fn<typeof fetch>(async () =>
        jsonResponse({ choices: [{ message: { content: "not json" } }] }),
      ),
    });

    await expect(
      provider.generateStructured({
        maxOutputTokens: 80,
        model: "gpt-4.1",
        prompt: "Return a title.",
        schema: z.object({ title: z.string() }),
      }),
    ).rejects.toMatchObject({
      category: "INVALID_REQUEST",
      retryable: false,
    });
  });

  it("retries a rate-limited request and succeeds on the next attempt", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: { type: "rate_limit" } }, 429)
        : jsonResponse({ choices: [{ message: { content: "ok" } }] });
    });
    const provider = new OpenAiProvider({
      credential: { apiKey: "sk-test-secret", baseUrl: "https://provider.test/v1" },
      fetchImpl,
      retryBaseDelayMs: 0,
    });

    await expect(
      provider.generateText({ maxOutputTokens: 10, model: "gpt-4.1", prompt: "Retry." }),
    ).resolves.toMatchObject({ text: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps Anthropic and Gemini response contracts to the shared result", async () => {
    const anthropic = new AnthropicProvider({
      credential: { apiKey: "anthropic-secret", baseUrl: "https://provider.test" },
      fetchImpl: vi.fn<typeof fetch>(async (_input, init) => {
        expect(new globalThis.Headers(init?.headers).get("x-api-key")).toBe("anthropic-secret");
        return jsonResponse({
          content: [{ text: "anthropic response", type: "text" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 4, output_tokens: 6 },
        });
      }),
    });
    const gemini = new GeminiProvider({
      credential: { apiKey: "gemini-secret", baseUrl: "https://provider.test/v1beta" },
      fetchImpl: vi.fn<typeof fetch>(async (input) => {
        expect(String(input)).toContain("key=gemini-secret");
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: "gemini response" }] } }],
          usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 3 },
        });
      }),
    });

    await expect(
      anthropic.generateText({ maxOutputTokens: 10, model: "claude-3-5-sonnet", prompt: "One." }),
    ).resolves.toMatchObject({ text: "anthropic response", usage: { inputTokens: 4, outputTokens: 6 } });
    await expect(
      gemini.generateText({ maxOutputTokens: 10, model: "gemini-1.5-pro", prompt: "One." }),
    ).resolves.toMatchObject({ text: "gemini response", usage: { inputTokens: 3, outputTokens: 5 } });
  });

  it("surfaces caller cancellation without retrying", async () => {
    const controller = new globalThis.AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new globalThis.DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const provider = new OpenAiProvider({
      credential: { apiKey: "sk-test-secret", baseUrl: "https://provider.test/v1" },
      fetchImpl,
    });
    const promise = provider.generateText({
      maxOutputTokens: 10,
      model: "gpt-4.1",
      prompt: "Cancel.",
      signal: controller.signal,
    });
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      category: "CANCELLED",
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
