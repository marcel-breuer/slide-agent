import { describe, expect, it } from "vitest";

import { buildBudgetUsageSnapshot, budgetRoutingLimits, monthlyWindow } from "./budget-usage";

describe("budget usage helpers", () => {
  it("summarizes monthly cost and token usage against configured limits", () => {
    const snapshot = buildBudgetUsageSnapshot({
      monthEnd: new Date("2026-08-01T00:00:00.000Z"),
      monthStart: new Date("2026-07-01T00:00:00.000Z"),
      operations: [
        { estimatedCost: "4.25", inputTokens: 1000, outputTokens: 250 },
        { estimatedCost: "1.25", inputTokens: 500, outputTokens: 250 },
      ],
      settings: {
        hardStopEnabled: true,
        monthlyMoneyBudget: "10",
        monthlyTokenBudget: 2000,
        preferredCurrency: "EUR",
        warningThresholdPercentage: 50,
      },
    });

    expect(snapshot.usage.estimatedCost).toBe(5.5);
    expect(snapshot.usage.tokens).toBe(2000);
    expect(snapshot.usage.remainingMoneyBudget).toBe(4.5);
    expect(snapshot.usage.remainingTokenBudget).toBe(0);
    expect(snapshot.usage.warningReached).toBe(true);
    expect(snapshot.usage.hardStopReached).toBe(true);
    expect(budgetRoutingLimits(snapshot)).toEqual({
      remainingBudget: 4.5,
      remainingTokens: 0,
    });
  });

  it("does not apply routing limits when hard stop is disabled", () => {
    const snapshot = buildBudgetUsageSnapshot({
      monthEnd: new Date("2026-08-01T00:00:00.000Z"),
      monthStart: new Date("2026-07-01T00:00:00.000Z"),
      operations: [{ estimatedCost: "20", inputTokens: 2000, outputTokens: 500 }],
      settings: {
        hardStopEnabled: false,
        monthlyMoneyBudget: "10",
        monthlyTokenBudget: 1000,
        preferredCurrency: "EUR",
        warningThresholdPercentage: 80,
      },
    });

    expect(snapshot.usage.hardStopReached).toBe(false);
    expect(budgetRoutingLimits(snapshot)).toEqual({
      remainingBudget: null,
      remainingTokens: null,
    });
  });

  it("uses calendar month boundaries in UTC", () => {
    expect(monthlyWindow(new Date("2026-07-09T18:00:00.000Z"))).toEqual({
      monthEnd: new Date("2026-08-01T00:00:00.000Z"),
      monthStart: new Date("2026-07-01T00:00:00.000Z"),
    });
  });
});
