import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument, validatePresentation, type PresentationDocument } from "@slide-agent/presentation-schema";

import {
  addSlideAfter,
  buildSlidePointerContext,
  createBlankSlide,
  createSlidePointer,
  deleteSlide,
  duplicateSlide,
  getSlideSelectionAfterDelete,
  moveSlide,
  renameSlide
} from "./index";

describe("slide pointers", () => {
  it("clamps pointer coordinates to the logical slide bounds", () => {
    const pointer = createSlidePointer({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1200,
      y: -40,
      instruction: "Change the headline"
    });

    expect(pointer).toMatchObject({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1000,
      y: 0,
      instruction: "Change the headline"
    });
  });

  it("builds focused AI context for one slide", () => {
    const context = buildSlidePointerContext("slide-1", [
      createSlidePointer({
        id: "pointer-1",
        slideId: "slide-1",
        x: 250,
        y: 281.25,
        instruction: "Make this number more prominent"
      }),
      createSlidePointer({
        id: "pointer-2",
        slideId: "slide-2",
        x: 100,
        y: 100,
        instruction: "Ignore other slides"
      })
    ]);

    expect(context).toBe("Slide AI pointers:\n1. pointer 1 at x 25%, y 50%: Make this number more prominent");
  });
});

describe("slide structure editing", () => {
  it("adds a schema-valid slide after the selected slide", () => {
    const document = withSlides(2);
    const next = addSlideAfter(document, {
      afterSlideId: "slide-1",
      slide: createBlankSlide({ id: "slide-new", title: "New topic" })
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
      title: "Executive summary copy"
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
      "3:slide-2"
    ]);
  });

  it("deletes slides while preserving a neighboring selection", () => {
    const document = withSlides(3);
    const selection = getSlideSelectionAfterDelete(document, {
      selectedSlideId: "slide-2",
      slideId: "slide-2"
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
      slideId: "slide-1"
    });

    expect(deleteSlide(document, "slide-1")).toBe(document);
    expect(selection).toEqual({ deleted: false, selectedSlideId: "slide-1" });
  });

  it("renames the slide title and the visible title text", () => {
    const document = withSlides(1);
    const next = renameSlide(document, { slideId: "slide-1", title: " Revised title " });
    const titleElement = next.slides[0]?.elements.find((element) => element.id === "title" && element.type === "text");

    expect(next.slides[0]?.title).toBe("Revised title");
    expect(titleElement?.type === "text" ? titleElement.paragraphs[0]?.runs[0]?.text : "").toBe("Revised title");
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
      title: `Slide ${index + 1}`
    };
  });

  return validatePresentation({ ...demo, slides });
}
