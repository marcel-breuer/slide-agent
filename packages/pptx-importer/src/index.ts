import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import {
  createDemoPresentationDocument,
  PRESENTATION_SCHEMA_VERSION,
  SLIDE_FORMAT,
  validatePresentation,
  type Paragraph,
  type PresentationDocument,
  type SlideDocument,
  type SlideElement,
  type TextRun,
} from "@slide-agent/presentation-schema";

export type PptxImportReport = {
  importedSlideCount: number;
  importedElementCount: number;
  fullyEditableElementCount: number;
  partiallyEditableElementCount: number;
  unsupportedElementCount: number;
  warnings: string[];
};

export type PptxImportOptions = {
  now?: string;
  ownerId: string;
  presentationId: string;
  title: string;
};

export type PptxImportResult = {
  document: PresentationDocument;
  report: PptxImportReport;
};

const PPTX_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const SLIDE_PATH_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

export function assertPptxSignature(bytes: Uint8Array): void {
  if (bytes.length < PPTX_SIGNATURE.length) throw new Error("PPTX file is too small.");
  for (let index = 0; index < PPTX_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PPTX_SIGNATURE[index]) {
      throw new Error("File is not a ZIP-based PowerPoint package.");
    }
  }
}

export async function inspectPptxPackage(bytes: Uint8Array): Promise<PptxImportReport> {
  const result = await readPptxPackage(bytes);
  return result.report;
}

export async function importPptxPackage(
  bytes: Uint8Array,
  options: PptxImportOptions,
): Promise<PptxImportResult> {
  const result = await readPptxPackage(bytes);
  const now = options.now ?? new Date().toISOString();
  const baseTheme = createDemoPresentationDocument({ ownerId: options.ownerId, now }).theme;
  const slides = result.slides.map((slide, index) =>
    createImportedSlide({
      order: index + 1,
      source: slide,
    }),
  );

  return {
    document: validatePresentation({
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      id: options.presentationId,
      title: options.title,
      locale: "en",
      format: SLIDE_FORMAT,
      theme: baseTheme,
      metadata: {
        createdAt: now,
        updatedAt: now,
        ownerId: options.ownerId,
      },
      slides,
    }),
    report: result.report,
  };
}

type ImportedSlideSource = {
  hadReadableText: boolean;
  path: string;
  textRuns: string[];
  unsupportedElementCount: number;
};

type PptxPackageReadResult = {
  report: PptxImportReport;
  slides: ImportedSlideSource[];
};

async function readPptxPackage(bytes: Uint8Array): Promise<PptxPackageReadResult> {
  assertPptxSignature(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);

  if (!names.includes("[Content_Types].xml") || !names.includes("ppt/presentation.xml")) {
    throw new Error("PPTX package is missing required OOXML parts.");
  }

  if (names.some((name) => name.includes(".."))) {
    throw new Error("PPTX package contains unsafe paths.");
  }

  const slidePaths = names
    .map((name) => ({ match: SLIDE_PATH_PATTERN.exec(name), name }))
    .filter((entry): entry is { match: RegExpExecArray; name: string } => Boolean(entry.match))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
    .map((entry) => entry.name);

  if (slidePaths.length === 0) {
    throw new Error("PPTX package does not contain any slides.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    textNodeName: "#text",
  });
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) throw new Error("PPTX package is missing ppt/presentation.xml.");
  parser.parse(presentationXml);

  const slides = await Promise.all(
    slidePaths.map(async (path) => {
      const slideXml = await zip.file(path)?.async("text");
      if (!slideXml) throw new Error(`PPTX package is missing ${path}.`);
      const parsedSlide = parser.parse(slideXml) as Record<string, unknown>;
      const textRuns = collectTextRuns(parsedSlide);
      return {
        hadReadableText: textRuns.length > 0,
        path,
        textRuns: textRuns.length > 0 ? textRuns : [`Imported ${path}`],
        unsupportedElementCount: countUnsupportedSlideElements(slideXml),
      };
    }),
  );

  const editableElementCount = slides.reduce((sum, slide) => sum + slide.textRuns.length, 0);
  const unsupportedElementCount = slides.reduce(
    (sum, slide) => sum + slide.unsupportedElementCount,
    0,
  );
  const warnings = buildImportWarnings(slides, unsupportedElementCount);

  return {
    slides,
    report: {
      importedSlideCount: slides.length,
      importedElementCount: editableElementCount + unsupportedElementCount,
      fullyEditableElementCount: editableElementCount,
      partiallyEditableElementCount: 0,
      unsupportedElementCount,
      warnings,
    },
  };
}

function createImportedSlide({
  order,
  source,
}: {
  order: number;
  source: ImportedSlideSource;
}): SlideDocument {
  const [titleRun, ...bodyRuns] = source.textRuns;
  const title = cleanText(titleRun) || `Imported slide ${order}`;
  const bodyText = bodyRuns.map(cleanText).filter(Boolean).join("\n");
  const elements: SlideElement[] = [
    {
      id: `slide-${order}-title`,
      type: "text",
      frame: { x: 60, y: 54, width: 880, height: 86, rotation: 0 },
      zIndex: 2,
      visible: true,
      locked: false,
      semanticRole: "title",
      opacity: 1,
      paragraphs: [
        createParagraph({
          color: "#0f172a",
          fontSize: 34,
          fontWeight: "700",
          text: title,
        }),
      ],
      verticalAlign: "top",
      autoFit: { enabled: true, minFontSize: 18, maxFontSize: 42 },
    },
  ];

  if (bodyText) {
    elements.push({
      id: `slide-${order}-body`,
      type: "text",
      frame: { x: 66, y: 166, width: 860, height: 310, rotation: 0 },
      zIndex: 2,
      visible: true,
      locked: false,
      semanticRole: "body",
      opacity: 1,
      paragraphs: bodyText.split("\n").map((text) =>
        createParagraph({
          color: "#334155",
          fontSize: 20,
          spacingAfter: 8,
          text,
        }),
      ),
      verticalAlign: "top",
      autoFit: { enabled: true, minFontSize: 12, maxFontSize: 24 },
    });
  }

  return {
    id: `slide-${order}`,
    order,
    title,
    purpose: `Imported from ${source.path}`,
    keyMessage: title,
    background: { type: "solid", color: "#ffffff" },
    elements,
    pointers: [],
    ...(source.unsupportedElementCount > 0
      ? {
          speakerNotes: `${source.unsupportedElementCount} unsupported source element(s) were reported during import.`,
        }
      : {}),
    sources: [],
    validation:
      source.unsupportedElementCount > 0
        ? {
            status: "warning",
            warnings: ["Some source elements require manual reconstruction."],
          }
        : { status: "passed", warnings: [] },
  };
}

function createParagraph({
  color,
  fontSize,
  fontWeight = "400",
  spacingAfter = 0,
  text,
}: {
  color: string;
  fontSize: number;
  fontWeight?: TextRun["fontWeight"];
  spacingAfter?: number;
  text: string;
}): Paragraph {
  return {
    runs: [
      {
        text,
        fontFamily: "Inter",
        fontSize,
        fontWeight,
        italic: false,
        underline: false,
        color,
      },
    ],
    align: "left",
    lineHeight: 1.15,
    spacingAfter,
    list: "none",
    indent: 0,
  };
}

function collectTextRuns(value: unknown): string[] {
  if (typeof value === "string") {
    const text = cleanText(value);
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextRuns(item));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const directText = record.t;
  const children = Object.entries(record)
    .filter(([key]) => key !== "t" && key !== "#text" && !key.startsWith("@_"))
    .flatMap(([, child]) => collectTextRuns(child));

  if (typeof directText === "string") {
    const text = cleanText(directText);
    return text ? [text, ...children] : children;
  }

  if (Array.isArray(directText)) {
    return [...directText.flatMap((item) => collectTextRuns(item)), ...children];
  }

  return children;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function countUnsupportedSlideElements(slideXml: string): number {
  const unsupportedPatterns = [
    /<p:pic\b/g,
    /<p:graphicFrame\b/g,
    /<p:grpSp\b/g,
    /<p:cxnSp\b/g,
    /<a:tbl\b/g,
    /<c:chart\b/g,
    /<dgm:/g,
  ];

  return unsupportedPatterns.reduce((count, pattern) => count + countMatches(slideXml, pattern), 0);
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

function buildImportWarnings(
  slides: ImportedSlideSource[],
  unsupportedElementCount: number,
): string[] {
  const warnings = [
    "Imported slides are converted into editable text-first layouts; complex source positioning may need manual adjustment.",
  ];

  const slidesWithoutText = slides.filter((slide) => !slide.hadReadableText);
  if (slidesWithoutText.length > 0) {
    warnings.push(`${slidesWithoutText.length} slide(s) did not contain readable text.`);
  }

  if (unsupportedElementCount > 0) {
    warnings.push(
      `${unsupportedElementCount} unsupported source element(s) such as images, charts, groups, or tables were reported.`,
    );
  }

  return warnings;
}
