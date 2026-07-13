import pptxgen from "pptxgenjs";
import JSZip from "jszip";

import {
  LOGICAL_SLIDE_HEIGHT,
  LOGICAL_SLIDE_WIDTH,
  type Paragraph,
  type PresentationDocument,
  type SlideElement,
  type TextRun,
} from "@slide-agent/presentation-schema";

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

export type ExportReport = {
  slideCount: number;
  elementCount: number;
  nativeEditableElementCount: number;
  nativeChartCount: number;
  flattenedGroupCount: number;
  svgFallbackCount: number;
  pngFallbackCount: number;
  warnings: string[];
};

export type ExportPresentationOptions = {
  includeSpeakerNotes?: boolean;
  resolveAsset?: (assetId: string) => string | undefined | Promise<string | undefined>;
};

type Position = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
};

function toInches(value: number, axis: "x" | "y"): number {
  const denominator = axis === "x" ? LOGICAL_SLIDE_WIDTH : LOGICAL_SLIDE_HEIGHT;
  const inches = axis === "x" ? 13.333 : 7.5;
  return (value / denominator) * inches;
}

function color(value: string): string {
  return value.replace(/^#/, "").slice(0, 6);
}

function positionFor(element: SlideElement): Position {
  return {
    x: toInches(element.frame.x, "x"),
    y: toInches(element.frame.y, "y"),
    w: toInches(element.frame.width, "x"),
    h: toInches(element.frame.height, "y"),
    rotate: element.frame.rotation,
  };
}

function shapeType(pptx: InstanceType<typeof pptxgen>, shape: Extract<SlideElement, { type: "shape" }>['shape']) {
  const shapes = pptx.ShapeType;
  const mapping = {
    rectangle: shapes.rect,
    roundedRectangle: shapes.roundRect,
    ellipse: shapes.ellipse,
    triangle: shapes.triangle,
    chevron: shapes.chevron,
    callout: shapes.callout1,
    hexagon: shapes.hexagon,
  } as const;
  return mapping[shape];
}

function textRunsForParagraph(paragraph: Paragraph, isLastParagraph: boolean) {
  return paragraph.runs.map((run: TextRun, index) => {
    const baseOptions = {
      bold: run.fontWeight === "700",
      color: color(run.color),
      fontFace: run.fontFamily,
      fontSize: run.fontSize,
      italic: run.italic,
      breakLine: index === paragraph.runs.length - 1 && !isLastParagraph,
      align: paragraph.align,
      lineSpacingMultiple: paragraph.lineHeight,
      paraSpaceAfter: paragraph.spacingAfter,
    };
    return {
      text: run.text,
      options: {
        ...baseOptions,
        ...(run.underline ? { underline: { style: "sng" as const } } : {}),
        ...(run.hyperlink ? { hyperlink: { url: run.hyperlink } } : {}),
        ...(paragraph.list !== "none"
          ? {
              bullet: {
                type: paragraph.list === "number" ? ("number" as const) : ("bullet" as const),
                indent: paragraph.indent,
              },
            }
          : {}),
      },
    };
  });
}

function addTextElement(
  slide: PptxSlide,
  element: Extract<SlideElement, { type: "text" }>,
  theme: PresentationDocument["theme"],
  report: ExportReport,
): void {
  const runs = element.paragraphs.flatMap((paragraph, index) =>
    textRunsForParagraph(paragraph, index === element.paragraphs.length - 1),
  );
  slide.addText(runs, {
    ...positionFor(element),
    valign: element.verticalAlign,
    fit: element.autoFit.enabled ? "shrink" : "none",
    fontFace: theme.fonts.body,
    objectName: element.accessibilityLabel ?? element.id,
  });
  report.nativeEditableElementCount += 1;
}

function addTableElement(
  slide: PptxSlide,
  element: Extract<SlideElement, { type: "table" }>,
  theme: PresentationDocument["theme"],
  report: ExportReport,
): void {
  const border = { color: color(element.borderColor), pt: 0.75 };
  const rows = element.rows.map((row, rowIndex) =>
    row.map((cell) => {
      const cellOptions = {
        bold: rowIndex < element.headerRows,
        color: color(theme.colors.text ?? "#0f172a"),
        fontFace: theme.fonts.body,
        fontSize: rowIndex < element.headerRows ? 11 : 10,
        border,
        margin: 0.06,
        valign: "middle" as const,
      };
      return {
        text: cell,
        options: {
          ...cellOptions,
          ...(rowIndex < element.headerRows
            ? { fill: { color: color(theme.colors.primary ?? "#e2e8f0") } }
            : {}),
        },
      };
    }),
  );
  slide.addTable(rows, {
    ...positionFor(element),
    border,
    fontFace: theme.fonts.body,
    fontSize: 10,
    margin: 0.06,
    valign: "middle",
    objectName: element.accessibilityLabel ?? element.id,
  });
  report.nativeEditableElementCount += 1;
}

function chartTypeAndOptions(
  element: Extract<SlideElement, { type: "chart" }>,
): { type: "area" | "bar" | "doughnut" | "line" | "pie"; options: Record<string, unknown> } {
  switch (element.chartType) {
    case "bar":
      return { type: "bar", options: { barDir: "bar", barGrouping: "clustered" } };
    case "column":
      return { type: "bar", options: { barDir: "col", barGrouping: "clustered" } };
    case "stackedBar":
      return { type: "bar", options: { barDir: "bar", barGrouping: "stacked" } };
    case "stackedColumn":
      return { type: "bar", options: { barDir: "col", barGrouping: "stacked" } };
    case "area":
      return { type: "area", options: { barGrouping: "standard" } };
    case "doughnut":
      return { type: "doughnut", options: { holeSize: 55 } };
    case "line":
      return { type: "line", options: { lineDataSymbol: "circle" } };
    case "pie":
      return { type: "pie", options: {} };
  }
}

function addChartElement(
  slide: PptxSlide,
  element: Extract<SlideElement, { type: "chart" }>,
  theme: PresentationDocument["theme"],
  report: ExportReport,
): void {
  const chart = chartTypeAndOptions(element);
  slide.addChart(
    chart.type,
    element.series.map((series) => ({ name: series.name, labels: element.categories, values: series.values })),
    {
      ...positionFor(element),
      ...chart.options,
      chartColors: [
        color(theme.colors.primary ?? "#9333ea"),
        color(theme.colors.accent ?? "#7c3aed"),
        color(theme.colors.muted ?? "#64748b"),
      ],
      showLegend: element.series.length > 1,
      showTitle: false,
      showValue: false,
      catAxisLabelFontFace: theme.fonts.body,
      valAxisLabelFontFace: theme.fonts.body,
      objectName: element.accessibilityLabel ?? element.id,
    },
  );
  report.nativeEditableElementCount += 1;
  report.nativeChartCount += 1;
}

function addLineElement(
  slide: PptxSlide,
  element: Extract<SlideElement, { type: "line" | "arrow" }>,
  report: ExportReport,
): void {
  const startX = element.frame.x + (Math.abs(element.start.x) <= 100 ? (element.start.x / 100) * element.frame.width : element.start.x);
  const startY = element.frame.y + (Math.abs(element.start.y) <= 100 ? (element.start.y / 100) * element.frame.height : element.start.y);
  const endX = element.frame.x + (Math.abs(element.end.x) <= 100 ? (element.end.x / 100) * element.frame.width : element.end.x);
  const endY = element.frame.y + (Math.abs(element.end.y) <= 100 ? (element.end.y / 100) * element.frame.height : element.end.y);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const shape = deltaX < 0 ? (deltaY < 0 ? slide.addShape.bind(slide, "line") : slide.addShape.bind(slide, "lineInv")) : deltaY < 0 ? slide.addShape.bind(slide, "lineInv") : slide.addShape.bind(slide, "line");
  shape({
    x: toInches(Math.min(startX, endX), "x"),
    y: toInches(Math.min(startY, endY), "y"),
    w: toInches(Math.abs(deltaX), "x"),
    h: toInches(Math.abs(deltaY), "y"),
    line: {
      color: color(element.stroke),
      width: element.strokeWidth,
      endArrowType: element.type === "arrow" ? "triangle" : "none",
    },
    objectName: element.accessibilityLabel ?? element.id,
  });
  report.nativeEditableElementCount += 1;
}

function dataUriFor(value: string): string | undefined {
  if (value.startsWith("data:")) return value;
  if (value.trimStart().startsWith("<svg")) {
    return `data:image/svg+xml;base64,${Buffer.from(value).toString("base64")}`;
  }
  return undefined;
}

async function addAssetElement(
  slide: PptxSlide,
  element: Extract<SlideElement, { type: "image" | "icon" }>,
  resolveAsset: ExportPresentationOptions["resolveAsset"],
  report: ExportReport,
): Promise<void> {
  const source = "src" in element ? element.src : element.svg;
  const assetId = element.type === "image" ? element.assetId : element.icon;
  const resolved = dataUriFor(source ?? "") ?? (resolveAsset ? dataUriFor((await resolveAsset(assetId)) ?? "") : undefined);
  if (!resolved) {
    report.warnings.push(
      `${element.type} “${element.id}” was not embedded because only data URIs or resolved data assets are supported.`,
    );
    if (element.type === "icon") report.svgFallbackCount += 1;
    if (element.type === "image") report.pngFallbackCount += 1;
    return;
  }
  slide.addImage({
    data: resolved,
    ...positionFor(element),
    altText: element.type === "image" ? element.alt : element.icon,
    objectName: element.accessibilityLabel ?? element.id,
  });
  if (element.type === "icon") report.svgFallbackCount += 1;
  else report.pngFallbackCount += 1;
}

async function addElement(
  pptx: InstanceType<typeof pptxgen>,
  slide: PptxSlide,
  element: SlideElement,
  document: PresentationDocument,
  options: ExportPresentationOptions,
  report: ExportReport,
): Promise<void> {
  if (element.type === "text") {
    addTextElement(slide, element, document.theme, report);
    return;
  }

  if (element.type === "shape") {
    slide.addShape(shapeType(pptx, element.shape), {
      ...positionFor(element),
      fill: { color: color(element.fill) },
      line: { color: color(element.borderColor), width: element.borderWidth },
      objectName: element.accessibilityLabel ?? element.id,
    });
    report.nativeEditableElementCount += 1;
    return;
  }

  if (element.type === "table") {
    addTableElement(slide, element, document.theme, report);
    return;
  }

  if (element.type === "chart") {
    addChartElement(slide, element, document.theme, report);
    return;
  }

  if (element.type === "line" || element.type === "arrow") {
    addLineElement(slide, element, report);
    return;
  }

  if (element.type === "image" || element.type === "icon") {
    await addAssetElement(slide, element, options.resolveAsset, report);
    return;
  }

  report.flattenedGroupCount += 1;
  report.warnings.push(`Group “${element.id}” was flattened; its children remain individually editable.`);
}

function masterNameFor(layoutId: string): string {
  const safeName = layoutId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "default";
  return `SlideAgent-${safeName}`;
}

function addBackground(
  slide: PptxSlide,
  sourceSlide: PresentationDocument["slides"][number],
  report: ExportReport,
): void {
  slide.background = { color: color(sourceSlide.background.color) };
  if (sourceSlide.background.type !== "solid") {
    report.warnings.push(
      `Slide “${sourceSlide.id}” uses a ${sourceSlide.background.type} background; the export uses its solid fallback color.`,
    );
  }
}

const DETERMINISTIC_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const DETERMINISTIC_DATE = new Date("2000-01-01T00:00:00.000Z");

function normalizeXml(xml: string): string {
  return xml.replace(
    /(<dcterms:(?:created|modified)[^>]*>)[^<]+(<\/dcterms:(?:created|modified)>)/g,
    `$1${DETERMINISTIC_TIMESTAMP}$2`,
  );
}

async function normalizeEmbeddedZip(buffer: Buffer): Promise<Buffer> {
  const source = await JSZip.loadAsync(buffer);
  const normalized = new JSZip();
  for (const [path, entry] of Object.entries(source.files)) {
    const data = entry.dir
      ? ""
      : path.endsWith(".xml")
        ? normalizeXml(await entry.async("string"))
        : await entry.async("nodebuffer");
    normalized.file(path, data, { date: DETERMINISTIC_DATE, createFolders: false });
  }
  return Buffer.from(
    await normalized.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "DOS",
    }),
  );
}

async function normalizePptxPackage(buffer: Buffer): Promise<Buffer> {
  const source = await JSZip.loadAsync(buffer);
  const normalized = new JSZip();
  const chartPaths = Object.keys(source.files)
    .filter((path) => /^ppt\/charts\/chart\d+\.xml$/.test(path))
    .sort((left, right) => Number(left.match(/(\d+)\.xml$/)?.[1]) - Number(right.match(/(\d+)\.xml$/)?.[1]));
  const chartRenames = new Map(
    chartPaths.map((path, index) => [path.match(/chart(\d+)\.xml$/)?.[1] ?? "", String(index + 1)]),
  );
  const workbookPaths = Object.keys(source.files)
    .filter((path) => /^ppt\/embeddings\/Microsoft_Excel_Worksheet\d+\.xlsx$/.test(path))
    .sort((left, right) => Number(left.match(/(\d+)\.xlsx$/)?.[1]) - Number(right.match(/(\d+)\.xlsx$/)?.[1]));
  const workbookRenames = new Map(
    workbookPaths.map((path, index) => [path.match(/Worksheet(\d+)\.xlsx$/)?.[1] ?? "", String(index + 1)]),
  );

  for (const [path, entry] of Object.entries(source.files)) {
    let normalizedPath = path;
    for (const [from, to] of chartRenames) {
      normalizedPath = normalizedPath.replace(`chart${from}.xml`, `chart${to}.xml`);
    }
    for (const [from, to] of workbookRenames) {
      normalizedPath = normalizedPath.replace(`Worksheet${from}.xlsx`, `Worksheet${to}.xlsx`);
    }

    let data: string | Buffer;
    if (entry.dir) {
      data = "";
    } else if (path.endsWith(".xlsx")) {
      data = await normalizeEmbeddedZip(await entry.async("nodebuffer"));
    } else if (path.endsWith(".xml") || path.endsWith(".rels")) {
      data = normalizeXml(await entry.async("string"));
      for (const [from, to] of chartRenames) {
        data = data.replaceAll(`chart${from}`, `chart${to}`);
      }
      for (const [from, to] of workbookRenames) {
        data = data.replaceAll(`Worksheet${from}`, `Worksheet${to}`);
      }
    } else {
      data = await entry.async("nodebuffer");
    }
    normalized.file(normalizedPath, data, { date: DETERMINISTIC_DATE, createFolders: false });
  }

  return Buffer.from(
    await normalized.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "DOS",
    }),
  );
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
  pptx.theme = {
    headFontFace: document.theme.fonts.heading,
    bodyFontFace: document.theme.fonts.body,
  };

  const report: ExportReport = {
    slideCount: document.slides.length,
    elementCount: document.slides.reduce((sum, slide) => sum + slide.elements.length, 0),
    nativeEditableElementCount: 0,
    nativeChartCount: 0,
    flattenedGroupCount: 0,
    svgFallbackCount: 0,
    pngFallbackCount: 0,
    warnings: [],
  };
  const definedMasters = new Set<string>();

  for (const sourceSlide of document.slides) {
    const masterName = sourceSlide.layoutId ? masterNameFor(sourceSlide.layoutId) : undefined;
    if (masterName && !definedMasters.has(masterName)) {
      pptx.defineSlideMaster({
        title: masterName,
        background: { color: color(sourceSlide.background.color) },
        objects: [],
      });
      definedMasters.add(masterName);
    }
    const slide = masterName ? pptx.addSlide(masterName) : pptx.addSlide();
    addBackground(slide, sourceSlide, report);
    for (const element of sourceSlide.elements.filter((candidate) => candidate.visible)) {
      await addElement(pptx, slide, element, document, options, report);
    }
    if (options.includeSpeakerNotes !== false && sourceSlide.speakerNotes) {
      slide.addNotes(sourceSlide.speakerNotes);
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer", compression: true });
  return { buffer: await normalizePptxPackage(Buffer.from(output as Buffer)), report };
}
