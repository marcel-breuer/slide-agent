import { describe, expect, it } from "vitest";

import { canReserveBudget, estimateCost } from "./index";

describe("pricing", () => {
  it("estimates cost and enforces the stricter budget", () => {
    const estimate = estimateCost(
      {
        provider: "openai",
        model: "structured-large",
        currency: "USD",
        inputPerMillion: 2,
        outputPerMillion: 8,
        imageGenerationUnit: 0,
        effectiveDate: new Date().toISOString(),
        active: true
      },
      { inputTokens: 100_000, outputTokens: 50_000 },
      "EUR",
      0.92
    );

    expect(estimate.totalTokens).toBe(150_000);
    expect(canReserveBudget(1, 100_000, estimate)).toBe(false);
  });
});
