import { describe, expect, it } from "vitest";

import {
  createDemoPresentationDocument,
  validatePresentation,
  type PresentationDocument,
} from "@slide-agent/presentation-schema";

import {
  addSlideAfter,
  applyCommand,
  applyCommands,
  buildSlidePointerContext,
  createBlankSlide,
  createEditorState,
  createPointerDrivenEditProposal,
  createSlidePointer,
  deleteSlide,
  dispatchEditorCommand,
  duplicateSlide,
  getSlideSelectionAfterDelete,
  moveSlide,
  redoEditorCommand,
  renameSlide,
  undoEditorCommand,
} from "./index";

describe("slide pointers", () => {
  it("clamps pointer coordinates to the logical slide bounds", () => {
    const pointer = createSlidePointer({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1200,
      y: -40,
      instruction: "Change the headline",
    });

    expect(pointer).toMatchObject({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1000,
      y: 0,
      instruction: "Change the headline",
    });
  });

  it("builds focused AI context for one slide", () => {
    const context = buildSlidePointerContext("slide-1", [
      createSlidePointer({
        id: "pointer-1",
        slideId: "slide-1",
        x: 250,
        y: 281.25,
        instruction: "Make this number more prominent",
      }),
      createSlidePointer({
        id: "pointer-2",
        slideId: "slide-2",
        x: 100,
        y: 100,
        instruction: "Ignore other slides",
      }),
    ]);

    expect(context).toBe(
      "Slide AI pointers:\n1. pointer 1 at x 25%, y 50%: Make this number more prominent",
    );
  });

  it("includes an anchored element in model context", () => {
    const context = buildSlidePointerContext("slide-1", [
      createSlidePointer({
        id: "pointer-1",
        instruction: "Increase contrast",
        label: "Chart",
        slideId: "slide-1",
        targetElementId: "revenue-chart",
        x: 400,
        y: 300,
      }),
    ]);

    expect(context).toContain("targeting element revenue-chart");
  });
});

describe("slide structure editing", () => {
  it("adds a schema-valid slide after the selected slide", () => {
    const document = withSlides(2);
    const next = addSlideAfter(document, {
      afterSlideId: "slide-1",
      slide: createBlankSlide({ id: "slide-new", title: "New topic" }),
    });

    expect(next.slides.map((slide) => slide.id)).toEqual(["slide-1", "slide-new", "slide-2"]);
    expect(next.slides.map((slide) => slide.order)).toEqual([1, 2, 3]);
    expect(validatePresentation(next).slides[1]?.title).toBe("New topic");
  });

  it("duplicates a slide next to the source with a stable new slide id", () => {
    const document = withSlides(2);
    const next = duplicateSlide(document, { slideId: "slide-1", newSlideId: "slide-copy" });

    expect(next.slides.map((slide) => slide.id)).toEqual(["slide-1", "slide-copy", "slide-2"]);
    expect(next.slides[1]).toMatchObject({
      id: "slide-copy",
      order: 2,
      title: "Executive summary copy",
    });
    expect(next.slides[1]?.elements).not.toBe(document.slides[0]?.elements);
    expect(validatePresentation(next).slides).toHaveLength(3);
  });

  it("moves slides and normalizes ordering", () => {
    const document = withSlides(3);
    const next = moveSlide(document, { slideId: "slide-3", toIndex: 0 });

    expect(next.slides.map((slide) => `${slide.order}:${slide.id}`)).toEqual([
      "1:slide-3",
      "2:slide-1",
      "3:slide-2",
    ]);
  });

  it("deletes slides while preserving a neighboring selection", () => {
    const document = withSlides(3);
    const selection = getSlideSelectionAfterDelete(document, {
      selectedSlideId: "slide-2",
      slideId: "slide-2",
    });
    const next = deleteSlide(document, "slide-2");

    expect(selection).toEqual({ deleted: true, selectedSlideId: "slide-3" });
    expect(next.slides.map((slide) => slide.id)).toEqual(["slide-1", "slide-3"]);
    expect(next.slides.map((slide) => slide.order)).toEqual([1, 2]);
  });

  it("prevents deleting the final slide", () => {
    const document = withSlides(1);
    const selection = getSlideSelectionAfterDelete(document, {
      selectedSlideId: "slide-1",
      slideId: "slide-1",
    });

    expect(deleteSlide(document, "slide-1")).toBe(document);
    expect(selection).toEqual({ deleted: false, selectedSlideId: "slide-1" });
  });

  it("renames the slide title and the visible title text", () => {
    const document = withSlides(1);
    const next = renameSlide(document, { slideId: "slide-1", title: " Revised title " });
    const titleElement = next.slides[0]?.elements.find(
      (element) => element.id === "title" && element.type === "text",
    );

    expect(next.slides[0]?.title).toBe("Revised title");
    expect(titleElement?.type === "text" ? titleElement.paragraphs[0]?.runs[0]?.text : "").toBe(
      "Revised title",
    );
  });
});

describe("editor command history", () => {
  it("applies commands and records undo history", () => {
    const document = withSlides(1);
    const state = createEditorState(document);
    const next = dispatchEditorCommand(state, {
      type: "RENAME_SLIDE",
      slideId: "slide-1",
      title: "Command title",
    });

    expect(next.document.slides[0]?.title).toBe("Command title");
    expect(next.undoStack).toHaveLength(1);
    expect(next.redoStack).toHaveLength(0);
  });

  it("undoes and redoes document commands", () => {
    const document = withSlides(1);
    const changed = dispatchEditorCommand(createEditorState(document), {
      type: "UPDATE_THEME_ACCENT",
      color: "#123456",
    });
    const undone = undoEditorCommand(changed);
    const redone = redoEditorCommand(undone);

    expect(undone.document.theme.colors.primary).toBe(document.theme.colors.primary);
    expect(undone.undoStack).toHaveLength(0);
    expect(undone.redoStack).toHaveLength(1);
    expect(redone.document.theme.colors.primary).toBe("#123456");
    expect(redone.undoStack).toHaveLength(1);
    expect(redone.redoStack).toHaveLength(0);
  });

  it("clears redo history when a new command is dispatched after undo", () => {
    const document = withSlides(1);
    const changed = dispatchEditorCommand(createEditorState(document), {
      type: "RENAME_SLIDE",
      slideId: "slide-1",
      title: "First",
    });
    const undone = undoEditorCommand(changed);
    const next = dispatchEditorCommand(undone, {
      type: "RENAME_SLIDE",
      slideId: "slide-1",
      title: "Second",
    });

    expect(next.document.slides[0]?.title).toBe("Second");
    expect(next.undoStack).toHaveLength(1);
    expect(next.redoStack).toHaveLength(0);
  });

  it("does not record no-op commands", () => {
    const document = withSlides(1);
    const state = createEditorState(document);
    const next = dispatchEditorCommand(state, {
      type: "MOVE_SLIDE",
      slideId: "slide-1",
      toIndex: 0,
    });

    expect(next).toBe(state);
  });

  it("applies slide structure commands through the command path", () => {
    const document = withSlides(2);
    const slide = createBlankSlide({ id: "slide-new", title: "Inserted" });
    const next = applyCommand(document, {
      type: "ADD_SLIDE_AFTER",
      afterSlideId: "slide-1",
      slide,
    });

    expect(next.slides.map((candidate) => candidate.id)).toEqual([
      "slide-1",
      "slide-new",
      "slide-2",
    ]);
  });
});

describe("pointer-driven edit proposals", () => {
  it("creates a structured proposal from pointers and a prompt", () => {
    const document = withSlides(1);
    const proposal = createPointerDrivenEditProposal({
      document,
      now: "2026-07-02T12:00:00.000Z",
      operationId: "ai-edit-test",
      pointers: [
        createSlidePointer({
          id: "pointer-1",
          instruction: "Make the slide feel less stark",
          label: "1",
          slideId: "slide-1",
          x: 200,
          y: 150,
        }),
      ],
      prompt: "Use #f8fafc for the area near the pointer.",
      slideId: "slide-1",
    });

    expect(proposal).toMatchObject({
      id: "ai-edit-test",
      slideId: "slide-1",
      pointerIds: ["pointer-1"],
      metadata: {
        operationId: "ai-edit-test",
        provider: "mock",
        promptVersion: "pointer-edit-v1",
      },
    });
    expect(proposal.commands[0]?.command).toEqual({
      color: "#f8fafc",
      slideId: "slide-1",
      type: "UPDATE_SLIDE_BACKGROUND",
    });
  });

  it("applies accepted proposal commands and records slide operation metadata", () => {
    const document = withSlides(1);
    const proposal = createPointerDrivenEditProposal({
      document,
      now: "2026-07-02T12:00:00.000Z",
      operationId: "ai-edit-test",
      pointers: [],
      prompt: "Refresh the background",
      slideId: "slide-1",
    });
    const next = applyCommands(document, [
      ...proposal.commands.map((entry) => entry.command),
      {
        metadata: {
          generatedAt: proposal.metadata.generatedAt,
          operationId: proposal.metadata.operationId,
          promptVersion: proposal.metadata.promptVersion,
        },
        slideId: proposal.slideId,
        type: "SET_SLIDE_AI_METADATA",
      },
    ]);

    expect(next.slides[0]?.background.color).not.toBe(document.slides[0]?.background.color);
    expect(next.slides[0]?.aiMetadata).toEqual({
      generatedAt: "2026-07-02T12:00:00.000Z",
      operationId: "ai-edit-test",
      promptVersion: "pointer-edit-v1",
    });
  });
});

function withSlides(count: number): PresentationDocument {
  const demo = createDemoPresentationDocument({ now: "2026-07-02T10:00:00.000Z" });
  const slides = Array.from({ length: count }, (_, index) => {
    const source = demo.slides[0]!;
    if (index === 0) return source;

    return {
      ...source,
      id: `slide-${index + 1}`,
      order: index + 1,
      title: `Slide ${index + 1}`,
    };
  });

  return validatePresentation({ ...demo, slides });
}
