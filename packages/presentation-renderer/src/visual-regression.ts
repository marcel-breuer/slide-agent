import type { PresentationDocument, SlideElement } from "@slide-agent/presentation-schema";

export const DEFAULT_VISUAL_VIEWPORT = { height: 900, width: 1600 } as const;

export type VisualBaseline = {
  fixtureId: string;
  height: number;
  payload: string;
  slideId: string;
  fingerprint: string;
  width: number;
};

export type VisualDiff = {
  changedLines: number;
  expectedFingerprint: string;
  actualFingerprint: string;
  passed: boolean;
  artifact: string;
};

export function createVisualBaseline(
  fixtureId: string,
  presentation: PresentationDocument,
  slideIndex = 0,
  viewport = DEFAULT_VISUAL_VIEWPORT,
): VisualBaseline {
  const slide = presentation.slides[slideIndex];
  if (!slide) throw new Error(`Visual fixture has no slide at index ${slideIndex}.`);

  const payload = JSON.stringify({
    slide: {
      background: slide.background,
      elements: slide.elements
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(serializeElement),
      id: slide.id,
      order: slide.order,
    },
    theme: presentation.theme,
    viewport,
  });

  return {
    fixtureId,
    height: viewport.height,
    payload,
    slideId: slide.id,
    fingerprint: hash(payload),
    width: viewport.width,
  };
}

export function compareVisualBaselines(
  expected: VisualBaseline,
  actual: VisualBaseline,
  maxChangedLines = 0,
): VisualDiff {
  const expectedLines = expected.payload.split("\n");
  const actualLines = actual.payload.split("\n");
  const changedLines = countChangedLines(expectedLines, actualLines);
  const artifact = [
    `--- ${expected.fixtureId}/${expected.slideId}`,
    `+++ ${actual.fixtureId}/${actual.slideId}`,
    `expected fingerprint: ${expected.fingerprint}`,
    `actual fingerprint: ${actual.fingerprint}`,
    `changed lines: ${changedLines}`,
  ].join("\n");

  return {
    actualFingerprint: actual.fingerprint,
    artifact,
    changedLines,
    expectedFingerprint: expected.fingerprint,
    passed:
      expected.fingerprint === actual.fingerprint &&
      expected.width === actual.width &&
      expected.height === actual.height &&
      changedLines <= maxChangedLines,
  };
}

function serializeElement(element: SlideElement): Record<string, unknown> {
  const base = {
    frame: element.frame,
    id: element.id,
    opacity: element.opacity,
    type: element.type,
    visible: element.visible,
    zIndex: element.zIndex,
  };

  switch (element.type) {
    case "text":
      return {
        ...base,
        paragraphs: element.paragraphs,
        verticalAlign: element.verticalAlign,
      };
    case "shape":
      return {
        ...base,
        borderColor: element.borderColor,
        borderWidth: element.borderWidth,
        fill: element.fill,
        shape: element.shape,
      };
    case "image":
      return { ...base, alt: element.alt, assetId: element.assetId, crop: element.crop };
    case "icon":
      return {
        ...base,
        color: element.color,
        icon: element.icon,
        strokeWidth: element.strokeWidth,
        svg: element.svg,
      };
    case "line":
    case "arrow":
      return {
        ...base,
        end: element.end,
        start: element.start,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      };
    case "table":
      return {
        ...base,
        borderColor: element.borderColor,
        headerRows: element.headerRows,
        rows: element.rows,
      };
    case "chart":
      return {
        ...base,
        categories: element.categories,
        chartType: element.chartType,
        series: element.series,
      };
    case "group":
      return { ...base, children: element.children };
  }
}

function countChangedLines(expected: string[], actual: string[]): number {
  const length = Math.max(expected.length, actual.length);
  let changed = 0;
  for (let index = 0; index < length; index += 1) {
    if (expected[index] !== actual[index]) changed += 1;
  }
  return changed;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}
