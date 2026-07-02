import type { PresentationDocument, SlideDocument, SlideElement } from "@slide-agent/presentation-schema";
import { GLOBAL_MAX_SLIDES, LOGICAL_SLIDE_HEIGHT, LOGICAL_SLIDE_WIDTH } from "@slide-agent/presentation-schema";

export type EditorCommand =
  | { type: "MOVE_ELEMENT"; slideId: string; elementId: string; dx: number; dy: number }
  | { type: "RESIZE_ELEMENT"; slideId: string; elementId: string; width: number; height: number }
  | { type: "DELETE_ELEMENT"; slideId: string; elementId: string }
  | { type: "RENAME_SLIDE"; slideId: string; title: string }
  | { type: "UPDATE_SHAPE_FILL"; slideId: string; elementId: string; fill: string }
  | { type: "UPDATE_SLIDE_BACKGROUND"; slideId: string; color: string }
  | { type: "UPDATE_THEME_ACCENT"; color: string }
  | { type: "DUPLICATE_SLIDE"; slideId: string; newSlideId: string }
  | { type: "ADD_SLIDE_AFTER"; afterSlideId?: string; slide: SlideDocument }
  | { type: "ADD_SLIDE"; slide: SlideDocument }
  | { type: "DELETE_SLIDE"; slideId: string }
  | { type: "MOVE_SLIDE"; slideId: string; toIndex: number };

export type EditorHistoryEntry = {
  command: EditorCommand;
  before: PresentationDocument;
  after: PresentationDocument;
};

export type EditorState = {
  document: PresentationDocument;
  undoStack: EditorHistoryEntry[];
  redoStack: EditorHistoryEntry[];
};

export type SlidePointer = {
  id: string;
  slideId: string;
  x: number;
  y: number;
  instruction: string;
};

export type CreateSlidePointerInput = {
  id: string;
  slideId: string;
  x: number;
  y: number;
  instruction?: string;
};

export type CreateBlankSlideInput = {
  id: string;
  order?: number;
  title?: string;
  accentColor?: string;
  textColor?: string;
};

export type SlideSelectionAfterDelete = {
  deleted: boolean;
  selectedSlideId: string;
};

export function createEditorState(document: PresentationDocument): EditorState {
  return {
    document,
    redoStack: [],
    undoStack: []
  };
}

export function dispatchEditorCommand(state: EditorState, command: EditorCommand): EditorState {
  const after = applyCommand(state.document, command);
  if (documentsMatch(state.document, after)) return state;

  return {
    document: after,
    redoStack: [],
    undoStack: [...state.undoStack, { after, before: state.document, command }]
  };
}

export function undoEditorCommand(state: EditorState): EditorState {
  const entry = state.undoStack.at(-1);
  if (!entry) return state;

  return {
    document: entry.before,
    redoStack: [...state.redoStack, entry],
    undoStack: state.undoStack.slice(0, -1)
  };
}

export function redoEditorCommand(state: EditorState): EditorState {
  const entry = state.redoStack.at(-1);
  if (!entry) return state;

  return {
    document: entry.after,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, entry]
  };
}

function clampCoordinate(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

function formatPercent(value: number, max: number): string {
  return `${Math.round((clampCoordinate(value, max) / max) * 1000) / 10}%`;
}

export function createSlidePointer(input: CreateSlidePointerInput): SlidePointer {
  return {
    id: input.id,
    slideId: input.slideId,
    x: clampCoordinate(input.x, LOGICAL_SLIDE_WIDTH),
    y: clampCoordinate(input.y, LOGICAL_SLIDE_HEIGHT),
    instruction: input.instruction?.trim() || "Describe the requested change here"
  };
}

export function buildSlidePointerContext(slideId: string, pointers: readonly SlidePointer[]): string {
  const slidePointers = pointers.filter((pointer) => pointer.slideId === slideId);
  if (slidePointers.length === 0) return "";

  const lines = slidePointers.map((pointer, index) => {
    const x = formatPercent(pointer.x, LOGICAL_SLIDE_WIDTH);
    const y = formatPercent(pointer.y, LOGICAL_SLIDE_HEIGHT);
    return `${index + 1}. pointer ${index + 1} at x ${x}, y ${y}: ${pointer.instruction}`;
  });

  return ["Slide AI pointers:", ...lines].join("\n");
}

export function createBlankSlide(input: CreateBlankSlideInput): SlideDocument {
  const title = input.title?.trim() || "Untitled slide";

  return {
    id: input.id,
    order: input.order ?? 1,
    title,
    purpose: "Draft the core message for this slide.",
    keyMessage: "",
    background: { type: "solid", color: "#ffffff" },
    speakerNotes: "",
    sources: [],
    elements: [
      {
        id: "title",
        type: "text",
        frame: { x: 60, y: 48, width: 820, height: 76, rotation: 0 },
        zIndex: 2,
        visible: true,
        locked: false,
        semanticRole: "title",
        opacity: 1,
        paragraphs: [
          {
            runs: [
              {
                text: title,
                fontFamily: "Inter",
                fontSize: 34,
                fontWeight: "700",
                italic: false,
                underline: false,
                color: input.textColor ?? "#0f172a"
              }
            ],
            align: "left",
            lineHeight: 1.15,
            spacingAfter: 0,
            list: "none",
            indent: 0
          }
        ],
        verticalAlign: "top",
        autoFit: { enabled: true, minFontSize: 10, maxFontSize: 48 }
      },
      {
        id: "accent-line",
        type: "shape",
        frame: { x: 60, y: 142, width: 190, height: 8, rotation: 0 },
        zIndex: 1,
        visible: true,
        locked: false,
        semanticRole: "accent",
        opacity: 1,
        shape: "roundedRectangle",
        fill: input.accentColor ?? "#9333ea",
        borderColor: input.accentColor ?? "#9333ea",
        borderWidth: 0
      }
    ]
  };
}

export function addSlideAfter(
  document: PresentationDocument,
  {
    afterSlideId,
    slide
  }: {
    afterSlideId?: string;
    slide: SlideDocument;
  }
): PresentationDocument {
  if (document.slides.length >= GLOBAL_MAX_SLIDES) return document;

  const afterIndex = afterSlideId ? document.slides.findIndex((candidate) => candidate.id === afterSlideId) : -1;
  const insertIndex = afterIndex >= 0 ? afterIndex + 1 : document.slides.length;
  const slides = [...document.slides.slice(0, insertIndex), slide, ...document.slides.slice(insertIndex)];

  return { ...document, slides: normalizeSlideOrder(slides) };
}

export function duplicateSlide(
  document: PresentationDocument,
  {
    newSlideId,
    slideId
  }: {
    newSlideId: string;
    slideId: string;
  }
): PresentationDocument {
  if (document.slides.length >= GLOBAL_MAX_SLIDES) return document;

  const sourceIndex = document.slides.findIndex((slide) => slide.id === slideId);
  if (sourceIndex < 0) return document;

  const source = document.slides[sourceIndex]!;
  const duplicated: SlideDocument = {
    ...structuredCloneSlide(source),
    id: newSlideId,
    title: source.title ? `${source.title} copy` : "Slide copy"
  };

  const slides = [
    ...document.slides.slice(0, sourceIndex + 1),
    duplicated,
    ...document.slides.slice(sourceIndex + 1)
  ];

  return { ...document, slides: normalizeSlideOrder(slides) };
}

export function deleteSlide(document: PresentationDocument, slideId: string): PresentationDocument {
  if (document.slides.length <= 1) return document;

  const slides = document.slides.filter((slide) => slide.id !== slideId);
  if (slides.length === document.slides.length) return document;

  return { ...document, slides: normalizeSlideOrder(slides) };
}

export function getSlideSelectionAfterDelete(
  document: PresentationDocument,
  {
    selectedSlideId,
    slideId
  }: {
    selectedSlideId: string;
    slideId: string;
  }
): SlideSelectionAfterDelete {
  const deleteIndex = document.slides.findIndex((slide) => slide.id === slideId);
  if (document.slides.length <= 1 || deleteIndex < 0) {
    return { deleted: false, selectedSlideId };
  }

  if (selectedSlideId !== slideId) {
    return { deleted: true, selectedSlideId };
  }

  const nextSlide = document.slides[deleteIndex + 1] ?? document.slides[deleteIndex - 1]!;
  return { deleted: true, selectedSlideId: nextSlide.id };
}

export function moveSlide(
  document: PresentationDocument,
  {
    slideId,
    toIndex
  }: {
    slideId: string;
    toIndex: number;
  }
): PresentationDocument {
  const fromIndex = document.slides.findIndex((slide) => slide.id === slideId);
  if (fromIndex < 0) return document;

  const clampedIndex = Math.max(0, Math.min(document.slides.length - 1, toIndex));
  if (fromIndex === clampedIndex) return document;

  const slides = [...document.slides];
  const [slide] = slides.splice(fromIndex, 1);
  slides.splice(clampedIndex, 0, slide!);

  return { ...document, slides: normalizeSlideOrder(slides) };
}

export function renameSlide(
  document: PresentationDocument,
  {
    slideId,
    title
  }: {
    slideId: string;
    title: string;
  }
): PresentationDocument {
  const nextTitle = title.trim() || "Untitled slide";

  return {
    ...document,
    slides: document.slides.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            title: nextTitle,
            elements: slide.elements.map((element) => renameTitleElement(element, nextTitle))
          }
        : slide
    )
  };
}

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
    case "RENAME_SLIDE":
      return renameSlide(document, { slideId: command.slideId, title: command.title });
    case "UPDATE_SHAPE_FILL":
      return {
        ...document,
        slides: document.slides.map((slide) =>
          slide.id === command.slideId
            ? mapElement(slide, command.elementId, (element) =>
                element.type === "shape" ? { ...element, fill: command.fill } : element
              )
            : slide
        )
      };
    case "UPDATE_SLIDE_BACKGROUND":
      return {
        ...document,
        slides: document.slides.map((slide) =>
          slide.id === command.slideId
            ? {
                ...slide,
                background: {
                  ...slide.background,
                  color: command.color
                }
              }
            : slide
        )
      };
    case "UPDATE_THEME_ACCENT":
      return {
        ...document,
        theme: {
          ...document.theme,
          colors: {
            ...document.theme.colors,
            accent: command.color,
            primary: command.color
          }
        }
      };
    case "DUPLICATE_SLIDE": {
      return duplicateSlide(document, { newSlideId: command.newSlideId, slideId: command.slideId });
    }
    case "ADD_SLIDE_AFTER":
      return addSlideAfter(
        document,
        command.afterSlideId ? { afterSlideId: command.afterSlideId, slide: command.slide } : { slide: command.slide }
      );
    case "ADD_SLIDE":
      return addSlideAfter(document, { slide: command.slide });
    case "DELETE_SLIDE":
      return deleteSlide(document, command.slideId);
    case "MOVE_SLIDE":
      return moveSlide(document, { slideId: command.slideId, toIndex: command.toIndex });
  }
}

function normalizeSlideOrder(slides: readonly SlideDocument[]): SlideDocument[] {
  return slides.map((slide, index) => ({ ...slide, order: index + 1 }));
}

function renameTitleElement(element: SlideElement, title: string): SlideElement {
  if (element.id !== "title" || element.type !== "text") return element;

  const firstParagraph = element.paragraphs[0];
  const firstRun = firstParagraph?.runs[0];
  if (!firstParagraph || !firstRun) return element;

  return {
    ...element,
    paragraphs: [
      {
        ...firstParagraph,
        runs: [{ ...firstRun, text: title }]
      },
      ...element.paragraphs.slice(1)
    ]
  };
}

function structuredCloneSlide(slide: SlideDocument): SlideDocument {
  return JSON.parse(JSON.stringify(slide)) as SlideDocument;
}

function documentsMatch(left: PresentationDocument, right: PresentationDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
