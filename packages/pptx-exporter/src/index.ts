import pptxgen from "pptxgenjs";

import {
  LOGICAL_SLIDE_HEIGHT,
  LOGICAL_SLIDE_WIDTH,
  type PresentationDocument,
  type SlideElement,
} from "@slide-agent/presentation-schema";

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

export type ExportReport = {
  slideCount: number;
  elementCount: number;
  nativeEditableElementCount: number;
  svgFallbackCount: number;
  pngFallbackCount: number;
  warnings: string[];
};

export type ExportPresentationOptions = {
  includeSpeakerNotes?: boolean;
};

function toInches(value: number, axis: "x" | "y"): number {
  const denominator = axis === "x" ? LOGICAL_SLIDE_WIDTH : LOGICAL_SLIDE_HEIGHT;
  const inches = axis === "x" ? 13.333 : 7.5;
  return (value / denominator) * inches;
}

function addElement(slide: PptxSlide, element: SlideElement, report: ExportReport): void {
  const position = {
    x: toInches(element.frame.x, "x"),
    y: toInches(element.frame.y, "y"),
    w: toInches(element.frame.width, "x"),
    h: toInches(element.frame.height, "y"),
    rotate: element.frame.rotation,
  };

  if (element.type === "text") {
    slide.addText(
      element.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
        .join("\n"),
      position,
    );
    report.nativeEditableElementCount += 1;
    return;
  }

  if (element.type === "shape") {
    slide.addShape("rect", {
      ...position,
      fill: { color: element.fill.replace("#", "") },
      line: { color: element.borderColor.replace("#", ""), width: element.borderWidth },
    });
    report.nativeEditableElementCount += 1;
    return;
  }

  if (element.type === "table") {
    slide.addTable(
      element.rows.map((row) => row.map((cell) => ({ text: cell }))),
      position,
    );
    report.nativeEditableElementCount += 1;
    return;
  }

  if (element.type === "chart") {
    report.warnings.push("Native chart export is prepared but not fully mapped in this MVP slice.");
    report.svgFallbackCount += 1;
    return;
  }

  report.warnings.push(
    `${element.type} export uses a fallback or requires a stored asset resolver.`,
  );
  report.svgFallbackCount += element.type === "icon" ? 1 : 0;
  report.pngFallbackCount += element.type === "image" ? 1 : 0;
}

export async function exportPresentation(
  document: PresentationDocument,
  options: ExportPresentationOptions = {},
): Promise<{ buffer: Buffer; report: ExportReport }> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Slide Agent";
  pptx.subject = document.title;
  pptx.title = document.title;
  pptx.company = "Slide Agent";

  const report: ExportReport = {
    slideCount: document.slides.length,
    elementCount: document.slides.reduce((sum, slide) => sum + slide.elements.length, 0),
    nativeEditableElementCount: 0,
    svgFallbackCount: 0,
    pngFallbackCount: 0,
    warnings: [],
  };

  for (const sourceSlide of document.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: sourceSlide.background.color.replace("#", "") };
    for (const element of sourceSlide.elements) {
      addElement(slide, element, report);
    }
    if (options.includeSpeakerNotes !== false && sourceSlide.speakerNotes) {
      slide.addNotes(sourceSlide.speakerNotes);
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return { buffer: Buffer.from(output as Buffer), report };
}
