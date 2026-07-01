import type { PresentationDocument, SlideDocument, SlideElement } from "@slide-agent/presentation-schema";

export type EditorCommand =
  | { type: "MOVE_ELEMENT"; slideId: string; elementId: string; dx: number; dy: number }
  | { type: "RESIZE_ELEMENT"; slideId: string; elementId: string; width: number; height: number }
  | { type: "DELETE_ELEMENT"; slideId: string; elementId: string }
  | { type: "DUPLICATE_SLIDE"; slideId: string; newSlideId: string }
  | { type: "ADD_SLIDE"; slide: SlideDocument }
  | { type: "DELETE_SLIDE"; slideId: string };

export type EditorState = {
  document: PresentationDocument;
  undoStack: EditorCommand[];
  redoStack: EditorCommand[];
};

function mapElement(slide: SlideDocument, elementId: string, update: (element: SlideElement) => SlideElement): SlideDocument {
  return {
    ...slide,
    elements: slide.elements.map((element) => (element.id === elementId ? update(element) : element))
  };
}

export function applyCommand(document: PresentationDocument, command: EditorCommand): PresentationDocument {
  switch (command.type) {
    case "MOVE_ELEMENT":
      return {
        ...document,
        slides: document.slides.map((slide) =>
          slide.id === command.slideId
            ? mapElement(slide, command.elementId, (element) => ({
                ...element,
                frame: {
                  ...element.frame,
                  x: element.frame.x + command.dx,
                  y: element.frame.y + command.dy
                }
              }))
            : slide
        )
      };
    case "RESIZE_ELEMENT":
      return {
        ...document,
        slides: document.slides.map((slide) =>
          slide.id === command.slideId
            ? mapElement(slide, command.elementId, (element) => ({
                ...element,
                frame: {
                  ...element.frame,
                  width: command.width,
                  height: command.height
                }
              }))
            : slide
        )
      };
    case "DELETE_ELEMENT":
      return {
        ...document,
        slides: document.slides.map((slide) =>
          slide.id === command.slideId
            ? { ...slide, elements: slide.elements.filter((element) => element.id !== command.elementId) }
            : slide
        )
      };
    case "DUPLICATE_SLIDE": {
      const source = document.slides.find((slide) => slide.id === command.slideId);
      if (!source) return document;
      const duplicated: SlideDocument = {
        ...source,
        id: command.newSlideId,
        order: source.order + 1,
        title: source.title ? `${source.title} copy` : undefined
      };
      const slides = [...document.slides, duplicated].map((slide, index) => ({ ...slide, order: index + 1 }));
      return { ...document, slides };
    }
    case "ADD_SLIDE":
      return {
        ...document,
        slides: [...document.slides, { ...command.slide, order: document.slides.length + 1 }]
      };
    case "DELETE_SLIDE":
      return {
        ...document,
        slides: document.slides
          .filter((slide) => slide.id !== command.slideId)
          .map((slide, index) => ({ ...slide, order: index + 1 }))
      };
  }
}
