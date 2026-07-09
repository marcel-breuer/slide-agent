// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BudgetSettings } from "./budget-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BudgetSettings", () => {
  it("loads budget usage and saves changed limits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createSnapshot() }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: createSnapshot({
              settings: {
                hardStopEnabled: false,
                monthlyMoneyBudget: 30,
                monthlyTokenBudget: 10000,
                preferredCurrency: "EUR",
                warningThresholdPercentage: 75,
              },
            }),
          }),
          { status: 200 },
        ),
      );

    render(<BudgetSettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Current month" })).toBeTruthy();
    });
    expect(screen.getByText("1,000")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Monthly spend budget"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Monthly token budget"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Warning threshold"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Hard stop"), {
      target: { value: "false" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save budget" }));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings/budget",
      expect.objectContaining({
        body: JSON.stringify({
          hardStopEnabled: false,
          monthlyMoneyBudget: 30,
          monthlyTokenBudget: 10000,
          warningThresholdPercentage: 75,
        }),
        method: "PATCH",
      }),
    );
  });
});

function createSnapshot(overrides: Partial<ReturnType<typeof createSnapshotRecord>> = {}) {
  return createSnapshotRecord(overrides);
}

function createSnapshotRecord(overrides = {}) {
  return {
    settings: {
      hardStopEnabled: true,
      monthlyMoneyBudget: 20,
      monthlyTokenBudget: 5000,
      preferredCurrency: "EUR",
      warningThresholdPercentage: 80,
    },
    usage: {
      estimatedCost: 3.5,
      hardStopReached: false,
      inputTokens: 900,
      moneyUsagePercentage: 17.5,
      monthEnd: "2026-08-01T00:00:00.000Z",
      monthStart: "2026-07-01T00:00:00.000Z",
      operations: 1,
      outputTokens: 100,
      remainingMoneyBudget: 16.5,
      remainingTokenBudget: 4000,
      tokenUsagePercentage: 20,
      tokens: 1000,
      warningReached: false,
    },
    ...overrides,
  };
}
