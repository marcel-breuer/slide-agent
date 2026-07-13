import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { applyCommands, createLayoutSuggestions } from "./index";

describe("layout suggestions", () => {
  it("generates multiple schema-safe alternatives without changing the document", () => {
    const document = createDemoPresentationDocument({ now: "2026-07-13T10:00:00.000Z" });
    const before = JSON.stringify(document);

    const suggestions = createLayoutSuggestions({ document, slideId: "slide-1" });

    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "balanced-columns",
      "focus-and-support",
      "compact-grid",
    ]);
    expect(JSON.stringify(document)).toBe(before);
    expect(suggestions.every((suggestion) => suggestion.commands.length > 0)).toBe(true);
  });

  it("preserves locked elements and supports undoable command application", () => {
    const document = createDemoPresentationDocument({ now: "2026-07-13T10:00:00.000Z" });
    const locked = { ...document.slides[0]!.elements[1]!, locked: true };
    document.slides[0]!.elements[1] = locked;

    const suggestion = createLayoutSuggestions({ document, slideId: "slide-1" })[0]!;
    const changed = applyCommands(document, suggestion.commands);

    expect(suggestion.preservedElementIds).toContain(locked.id);
    expect(
      suggestion.commands.some(
        (command) => "elementId" in command && command.elementId === locked.id,
      ),
    ).toBe(false);
    expect(changed.slides[0]!.elements.find((element) => element.id === locked.id)?.frame).toEqual(
      locked.frame,
    );
  });

  it("reports overflow risk for dense text content", () => {
    const document = createDemoPresentationDocument({ now: "2026-07-13T10:00:00.000Z" });
    const slide = document.slides[0]!;
    const textElement = slide.elements.find((element) => element.type === "text");
    if (!textElement || textElement.type !== "text") throw new Error("Expected text fixture.");
    const paragraph = textElement.paragraphs[0]!;
    const run = paragraph.runs[0]!;
    slide.elements.push({
      ...textElement,
      id: "dense-copy",
      paragraphs: [{ ...paragraph, runs: [{ ...run, text: "x".repeat(500) }] }],
      type: "text",
    });

    expect(createLayoutSuggestions({ document, slideId: slide.id })[0]!.overflowRisk).toContain(
      "overflow",
    );
  });
});
