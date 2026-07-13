// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayoutSuggestionPreview } from "./layout-suggestion-preview";

afterEach(() => {
  cleanup();
});

describe("LayoutSuggestionPreview", () => {
  it("supports preview rejection and applying a selected suggestion", () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    const suggestion = {
      commands: [],
      designProfileCompatibility: "Compatible with the active profile.",
      id: "balanced-columns",
      overflowRisk: "Review text fit after applying.",
      preservedElementIds: ["locked-image"],
      summary: "Distributes editable content across two columns.",
      title: "Balanced columns",
    };

    render(
      <LayoutSuggestionPreview
        suggestions={[suggestion]}
        onApply={onApply}
        onReject={onReject}
      />,
    );

    expect(screen.getByText("Preview alternatives without changing the active slide.")).toBeTruthy();
    expect(screen.getByText("Locked elements preserved: 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject layout suggestions" }));

    expect(onApply).toHaveBeenCalledWith(suggestion);
    expect(onReject).toHaveBeenCalledOnce();
  });
});
