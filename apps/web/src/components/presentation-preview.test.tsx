// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoPresentationDocument, type PresentationDocument } from "@slide-agent/presentation-schema";

import {
  PresentationPreview,
  getPreviewNavigationSlideId,
  resolveInitialPreviewSlideId
} from "./presentation-preview";

afterEach(() => {
  cleanup();
});

describe("PresentationPreview", () => {
  it("opens on the requested slide in a read-only viewer", () => {
    const presentation = createPreviewTestDocument();
    const requestedSlide = presentation.slides[1]!;
    render(
      <PresentationPreview
        initialSlideId={requestedSlide.id}
        onClose={() => undefined}
        presentation={presentation}
      />
    );

    expect(screen.getByRole("dialog", { name: "Presentation preview" })).toBeTruthy();
    expect(screen.getByText("Slide 2 of 3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: requestedSlide.title ?? "" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /title/i })).toBeNull();
  });

  it("navigates with toolbar buttons without closing the preview", () => {
    const presentation = createPreviewTestDocument();
    const onClose = vi.fn();
    render(
      <PresentationPreview
        initialSlideId={presentation.slides[0]!.id}
        onClose={onClose}
        presentation={presentation}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("Slide 2 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(screen.getByText("Slide 1 of 3")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("supports keyboard navigation and closes with Escape", () => {
    const presentation = createPreviewTestDocument();
    const onClose = vi.fn();
    render(
      <PresentationPreview
        initialSlideId={presentation.slides[0]!.id}
        onClose={onClose}
        presentation={presentation}
      />
    );

    fireEvent.keyDown(globalThis.window, { key: "ArrowRight" });
    expect(screen.getByText("Slide 2 of 3")).toBeTruthy();

    fireEvent.keyDown(globalThis.window, { key: "ArrowLeft" });
    expect(screen.getByText("Slide 1 of 3")).toBeTruthy();

    fireEvent.keyDown(globalThis.window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("preview navigation helpers", () => {
  it("uses the first slide when the requested slide is unavailable", () => {
    const presentation = createPreviewTestDocument();

    expect(resolveInitialPreviewSlideId(presentation.slides, "missing-slide")).toBe(presentation.slides[0]!.id);
  });

  it("clamps previous and next navigation to the deck bounds", () => {
    const presentation = createPreviewTestDocument();

    expect(getPreviewNavigationSlideId(presentation.slides, presentation.slides[0]!.id, -1)).toBe(
      presentation.slides[0]!.id
    );
    expect(getPreviewNavigationSlideId(presentation.slides, presentation.slides.at(-1)!.id, 1)).toBe(
      presentation.slides.at(-1)!.id
    );
  });
});

function createPreviewTestDocument(): PresentationDocument {
  const base = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
  const firstSlide = base.slides[0]!;

  return {
    ...base,
    slides: [
      firstSlide,
      { ...firstSlide, id: "slide-2", order: 2, title: "Financial outlook" },
      { ...firstSlide, id: "slide-3", order: 3, title: "Delivery plan" }
    ]
  };
}
