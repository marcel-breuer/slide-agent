import { createHash } from "node:crypto";

import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";

import {
  createDemoPresentationDocument,
  PRESENTATION_SCHEMA_VERSION,
  SLIDE_FORMAT,
  validatePresentation,
  type Paragraph,
  type PresentationDocument,
  type Rect,
  type SlideDocument,
  type SlideElement,
  type TextRun,
} from "@slide-agent/presentation-schema";

export type ImportWarning = {
  slideId: string;
  elementId?: string;
  message: string;
};

export type PptxImportReport = {
  importedSlideCount: number;
  importedElementCount: number;
  fullyEditableElementCount: number;
  partiallyEditableElementCount: number;
  unsupportedElementCount: number;
  warnings: string[];
  slideWarnings: Array<{ slideId: string; warnings: string[] }>;
  elementWarnings: ImportWarning[];
};

export type PptxImportOptions = {
  now?: string;
  ownerId: string;
  presentationId: string;
  title: string;
  maxPackageBytes?: number;
  maxAssetBytes?: number;
};

export type PptxImportResult = {
  document: PresentationDocument;
  report: PptxImportReport;
};

type XmlNode = Record<string, unknown>;
type Relationship = { id: string; target: string; external: boolean };
type RelationshipMap = Map<string, Relationship>;
type PptxSlide = { path: string; root: XmlNode; relationships: RelationshipMap; layoutId?: string };
type ImportContext = {
  zip: JSZip;
  parser: XMLParser;
  theme: PresentationDocument["theme"];
  maxAssetBytes: number;
  report: ReportBuilder;
};

const PPTX_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const DEFAULT_MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_ASSET_BYTES = 25 * 1024 * 1024;
const EMU_PER_INCH = 914400;
const SLIDE_WIDTH_INCHES = 13.333;
const SLIDE_HEIGHT_INCHES = 7.5;
const SLIDE_PATH_PATTERN = /^ppt\/slides\/slide\d+\.xml$/;

class ReportBuilder {
  private readonly slideWarnings = new Map<string, string[]>();
  readonly warnings: string[] = [];
  readonly elementWarnings: ImportWarning[] = [];
  importedElementCount = 0;
  fullyEditableElementCount = 0;
  partiallyEditableElementCount = 0;
  unsupportedElementCount = 0;

  warn(slideId: string, message: string, elementId?: string, unsupported = false): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
    const warnings = this.slideWarnings.get(slideId) ?? [];
    if (!warnings.includes(message)) warnings.push(message);
    this.slideWarnings.set(slideId, warnings);
    if (elementId) this.elementWarnings.push({ slideId, elementId, message });
    if (unsupported) this.unsupportedElementCount += 1;
  }

  toReport(slideCount: number): PptxImportReport {
    return {
      importedSlideCount: slideCount,
      importedElementCount: this.importedElementCount,
      fullyEditableElementCount: this.fullyEditableElementCount,
      partiallyEditableElementCount: this.partiallyEditableElementCount,
      unsupportedElementCount: this.unsupportedElementCount,
      warnings: this.warnings,
      slideWarnings: [...this.slideWarnings.entries()].map(([slideId, warnings]) => ({
        slideId,
        warnings,
      })),
      elementWarnings: this.elementWarnings,
    };
  }
}

export function assertPptxSignature(bytes: Uint8Array): void {
  if (bytes.length < PPTX_SIGNATURE.length) throw new Error("PPTX file is too small.");
  for (let index = 0; index < PPTX_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PPTX_SIGNATURE[index]) {
      throw new Error("File is not a ZIP-based PowerPoint package.");
    }
  }
}

export async function inspectPptxPackage(
  bytes: Uint8Array,
  options: Pick<PptxImportOptions, "maxPackageBytes" | "maxAssetBytes"> = {},
): Promise<PptxImportReport> {
  const result = await readPptxPackage(bytes, options);
  for (const [index, slide] of result.slides.entries()) {
    await createImportedSlide(slide, index + 1, result.context);
  }
  return result.context.report.toReport(result.slides.length);
}

export async function importPptxPackage(
  bytes: Uint8Array,
  options: PptxImportOptions,
): Promise<PptxImportResult> {
  const result = await readPptxPackage(bytes, options);
  const now = options.now ?? new Date().toISOString();
  const baseTheme = result.theme;

  const slides = await Promise.all(
    result.slides.map((slide, index) => createImportedSlide(slide, index + 1, result.context)),
  );
  const document = validatePresentation({
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
  });

  return { document, report: result.context.report.toReport(result.slides.length) };
}

type PptxPackageReadResult = {
  report: PptxImportReport;
  slides: PptxSlide[];
  theme: PresentationDocument["theme"];
  context: ImportContext;
};

async function readPptxPackage(
  bytes: Uint8Array,
  options: Pick<PptxImportOptions, "maxPackageBytes" | "maxAssetBytes">,
): Promise<PptxPackageReadResult> {
  assertPptxSignature(bytes);
  const maxPackageBytes = options.maxPackageBytes ?? DEFAULT_MAX_PACKAGE_BYTES;
  if (bytes.byteLength > maxPackageBytes) {
    throw new Error(`PPTX package exceeds the ${formatBytes(maxPackageBytes)} limit.`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    throw new Error("PPTX package is not a valid ZIP archive.");
  }
  validatePackagePaths(zip);
  await validateExpandedPackageSize(zip, maxPackageBytes);

  const requiredParts = ["[Content_Types].xml", "ppt/presentation.xml"];
  for (const part of requiredParts) {
    if (!zip.file(part)) throw new Error(`PPTX package is missing required part: ${part}.`);
  }

  const parser = createParser();
  const report = new ReportBuilder();
  const context: ImportContext = {
    zip,
    parser,
    theme: createDemoPresentationDocument({ ownerId: "import", now: "2026-01-01T00:00:00.000Z" }).theme,
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    report,
  };
  const presentation = await parseXmlPart(zip, "ppt/presentation.xml", parser);
  const presentationRelationships = await readRelationships(zip, "ppt/presentation.xml", parser);
  context.theme = await readTheme(context, presentationRelationships);
  const slidePaths = await resolveSlideOrder(zip, presentation, presentationRelationships);
  if (slidePaths.length === 0) throw new Error("PPTX package does not contain any slides.");

  const slides = await Promise.all(
    slidePaths.map(async (path) => {
      const root = await parseXmlPart(zip, path, parser);
      const relationships = await readRelationships(zip, path, parser);
      const layoutRelationship = [...relationships.values()].find((relationship) =>
        relationship.target.includes("slideLayout"),
      );
      const slide = {
        path,
        root,
        relationships,
      };
      return layoutRelationship && !layoutRelationship.external
        ? { ...slide, layoutId: layoutRelationship.target }
        : slide;
    }),
  );

  return { report: report.toReport(slides.length), slides, theme: context.theme, context };
}

function createParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    textNodeName: "#text",
    processEntities: false,
    allowBooleanAttributes: true,
  });
}

function validatePackagePaths(zip: JSZip): void {
  for (const [name, entry] of Object.entries(zip.files)) {
    const original = String((entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? name);
    const normalized = original.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "..")) {
      throw new Error("PPTX package contains unsafe paths.");
    }
  }
}

async function validateExpandedPackageSize(zip: JSZip, maxPackageBytes: number): Promise<void> {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    total += (await entry.async("uint8array")).byteLength;
    if (total > maxPackageBytes) {
      throw new Error(`Expanded PPTX package exceeds the ${formatBytes(maxPackageBytes)} limit.`);
    }
  }
}

async function parseXmlPart(zip: JSZip, path: string, parser: XMLParser): Promise<XmlNode> {
  const content = await zip.file(path)?.async("text");
  if (!content) throw new Error(`PPTX package is missing ${path}.`);
  try {
    const validation = XMLValidator.validate(content);
    if (validation !== true) throw new Error("invalid XML");
    return asNode(parser.parse(content)) ?? {};
  } catch {
    throw new Error(`PPTX package contains malformed XML in ${path}.`);
  }
}

async function readRelationships(zip: JSZip, sourcePath: string, parser: XMLParser): Promise<RelationshipMap> {
  const directory = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
  const fileName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
  const relationshipsPath = `${directory ? `${directory}/` : ""}_rels/${fileName}.rels`;
  const xml = await zip.file(relationshipsPath)?.async("text");
  if (!xml) return new Map();
  const parsed = asNode(parser.parse(xml));
  const root = child(parsed, "Relationships");
  const relationships = new Map<string, Relationship>();
  for (const relationship of array(child(root, "Relationship"))) {
    const id = attribute(relationship, "Id");
    const target = attribute(relationship, "Target");
    if (!id || !target) continue;
    relationships.set(id, {
      id,
      target: resolvePackageTarget(sourcePath, target),
      external: attribute(relationship, "TargetMode") === "External" || isExternalTarget(target),
    });
  }
  return relationships;
}

function resolvePackageTarget(sourcePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const base = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
  const segments = `${base}${target}`.replace(/\\/g, "/").split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop();
    else result.push(segment);
  }
  return result.join("/");
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target);
}

async function resolveSlideOrder(
  zip: JSZip,
  presentation: XmlNode,
  presentationRelationships: RelationshipMap,
): Promise<string[]> {
  const presentationNode = child(presentation, "presentation");
  const slideIds = array(child(child(presentationNode, "sldIdLst"), "sldId"));
  const ordered = slideIds
    .map((slideId) => {
      const relationshipId = attribute(slideId, "r:id");
      return relationshipId ? presentationRelationships.get(relationshipId) : undefined;
    })
    .filter((relationship): relationship is Relationship =>
      relationship !== undefined && relationship.external === false,
    )
    .map((relationship) => relationship.target);
  if (ordered.length > 0) return ordered.filter((path) => Boolean(zip.file(path)));
  return Object.keys(zip.files)
    .filter((path) => SLIDE_PATH_PATTERN.test(path))
    .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]));
}

async function readTheme(
  context: ImportContext,
  presentationRelationships: RelationshipMap,
): Promise<PresentationDocument["theme"]> {
  const themeRelationship = [...presentationRelationships.values()].find((relationship) =>
    relationship.target.includes("theme"),
  );
  if (!themeRelationship || themeRelationship.external) return context.theme;
  const themeRoot = await parseXmlPart(context.zip, themeRelationship.target, context.parser);
  const theme = child(themeRoot, "theme");
  const themeElements = child(theme, "themeElements");
  const fontScheme = child(themeElements, "fontScheme");
  const majorFont = attribute(child(child(fontScheme, "majorFont"), "latin"), "typeface");
  const minorFont = attribute(child(child(fontScheme, "minorFont"), "latin"), "typeface");
  const colorScheme = child(themeElements, "clrScheme");
  const colors: Record<string, string> = { ...context.theme.colors };
  const textColor = readDrawingColor(child(colorScheme, "dk1"), colors.text ?? "#0f172a");
  const primaryColor = readDrawingColor(child(colorScheme, "accent1"), colors.primary ?? "#9333ea");
  const accentColor = readDrawingColor(child(colorScheme, "accent2"), colors.accent ?? "#7c3aed");
  const mutedColor = readDrawingColor(child(colorScheme, "accent3"), colors.muted ?? "#64748b");
  colors.text = textColor;
  colors.primary = primaryColor;
  colors.accent = accentColor;
  colors.muted = mutedColor;
  return {
    colors,
    fonts: {
      heading: majorFont || context.theme.fonts.heading,
      body: minorFont || context.theme.fonts.body,
    },
  };
}

async function createImportedSlide(source: PptxSlide, order: number, context: ImportContext): Promise<SlideDocument> {
  const slideNode = asNode(child(source.root, "sld"));
  const cSld = asNode(child(slideNode, "cSld"));
  const slideId = `slide-${order}`;
  const backgroundColor = readDrawingColor(
    child(child(child(cSld, "bg"), "bgPr"), "solidFill"),
    "#ffffff",
  );
  const elements = await parseElements(asNode(child(cSld, "spTree")), source, context, slideId, 0);
  const titleElement = elements.find((element) => element.type === "text" && element.semanticRole === "title");
  const title = titleElement?.type === "text" ? paragraphText(titleElement.paragraphs[0]) : `Imported slide ${order}`;
  const speakerNotes = await readNotes(source, context);
  const slideWarnings = context.report.toReport(0).slideWarnings.find((warning) => warning.slideId === slideId);
  return {
    id: slideId,
    order,
    title,
    purpose: `Imported from ${source.path}`,
    keyMessage: title,
    layoutId: source.layoutId ? source.layoutId.split("/").at(-1)?.replace(/\.xml$/, "") : undefined,
    background: { type: "solid", color: backgroundColor },
    elements,
    pointers: [],
    speakerNotes: speakerNotes || (slideWarnings ? slideWarnings.warnings.join(" ") : undefined),
    sources: [],
    validation: slideWarnings
      ? { status: "warning", warnings: slideWarnings.warnings }
      : { status: "passed", warnings: [] },
  };
}

async function parseElements(
  tree: XmlNode | null,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  depth: number,
): Promise<SlideElement[]> {
  if (!tree) return [];
  const elements: SlideElement[] = [];
  const candidates: Array<[string, unknown]> = [
    ["sp", child(tree, "sp")],
    ["pic", child(tree, "pic")],
    ["graphicFrame", child(tree, "graphicFrame")],
    ["cxnSp", child(tree, "cxnSp")],
    ["grpSp", child(tree, "grpSp")],
  ];
  let zIndex = 0;
  for (const [type, value] of candidates) {
    for (const nodeValue of array(value)) {
      const node = asNode(nodeValue);
      if (!node) continue;
      const parsed = await parseElement(type, node, source, context, slideId, zIndex, depth);
      if (parsed.length > 0) {
        elements.push(...parsed);
        zIndex += parsed.length;
      }
    }
  }
  return elements;
}

async function parseElement(
  type: string,
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  zIndex: number,
  depth: number,
): Promise<SlideElement[]> {
  const id = elementName(node, `${slideId}-${type}-${zIndex}`);
  if (type === "grpSp") {
    const groupFrame = frameFrom(node, { x: 40, y: 40, width: 920, height: 480, rotation: 0 });
    const children = await parseElements(node, source, context, slideId, depth + 1);
    const childIds = children.map((childElement) => childElement.id);
    if (childIds.length === 0) {
      warn(context, slideId, "Group did not contain convertible children.", id, true);
      return [];
    }
    context.report.importedElementCount += children.length + 1;
    context.report.fullyEditableElementCount += children.length;
    return [
      ...children,
      {
        id,
        type: "group",
        frame: groupFrame,
        zIndex,
        visible: true,
        locked: false,
        semanticRole: "group",
        opacity: 1,
        children: childIds,
      },
    ];
  }

  if (type === "sp") {
    const textBody = asNode(child(node, "txBody"));
    if (textBody) {
      const textElement = parseTextElement(node, textBody, source, context, slideId, id, zIndex);
      if (textElement) {
        context.report.importedElementCount += 1;
        context.report.fullyEditableElementCount += 1;
        return [textElement];
      }
    }
    const shape = parseShapeElement(node, source, context, slideId, id, zIndex);
    context.report.importedElementCount += 1;
    context.report.fullyEditableElementCount += 1;
    return [shape];
  }

  if (type === "cxnSp") {
    const element = parseLineElement(node, source, context, slideId, id, zIndex);
    context.report.importedElementCount += 1;
    context.report.fullyEditableElementCount += 1;
    return [element];
  }

  if (type === "pic") {
    const element = await parseImageElement(node, source, context, slideId, id, zIndex);
    if (!element) return [];
    context.report.importedElementCount += 1;
    context.report.partiallyEditableElementCount += 1;
    return [element];
  }

  const graphicData = child(child(child(node, "graphic"), "graphicData"), "tbl")
    ? "table"
    : child(child(child(node, "graphic"), "graphicData"), "chart")
      ? "chart"
      : "unsupported";
  if (graphicData === "table") {
    const element = parseTableElement(node, source, context, slideId, id, zIndex);
    context.report.importedElementCount += 1;
    context.report.fullyEditableElementCount += 1;
    return [element];
  }
  if (graphicData === "chart") {
    const element = await parseChartElement(node, source, context, slideId, id, zIndex);
    if (element) {
      context.report.importedElementCount += 1;
      context.report.fullyEditableElementCount += 1;
      return [element];
    }
  }
  warn(context, slideId, "Graphic frame could not be converted to a supported editable element.", id, true);
  return [];
}

function parseTextElement(
  node: XmlNode,
  textBody: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Extract<SlideElement, { type: "text" }> | null {
  const paragraphs = array(child(textBody, "p"))
    .map((paragraph) => parseParagraph(asNode(paragraph), source, context))
    .filter((paragraph): paragraph is Paragraph => Boolean(paragraph));
  if (paragraphs.length === 0) return null;
  const frame = frameFrom(node, { x: 60, y: 50, width: 880, height: 120, rotation: 0 });
  const bodyProperties = child(textBody, "bodyPr");
  const anchor = attribute(bodyProperties, "anchor");
  return {
    id,
    type: "text",
    frame,
    zIndex,
    visible: true,
    locked: false,
    semanticRole: /title/i.test(id) || zIndex === 0 ? "title" : "content",
    opacity: 1,
    paragraphs,
    verticalAlign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top",
    autoFit: {
      enabled: Boolean(child(bodyProperties, "normAutofit") ?? child(bodyProperties, "spAutoFit")),
      minFontSize: 10,
      maxFontSize: 160,
    },
  };
}

function parseParagraph(
  paragraph: XmlNode | null,
  source: PptxSlide,
  context: ImportContext,
): Paragraph | null {
  if (!paragraph) return null;
  const pPr = asNode(child(paragraph, "pPr"));
  const runs = array(child(paragraph, "r"))
    .map((run) => parseTextRun(asNode(run), pPr, source, context))
    .filter((run): run is TextRun => Boolean(run));
  if (runs.length === 0) return null;
  const lineSpacing = Number(attribute(asNode(child(pPr, "lnSpc")), "val"));
  const bullet = child(pPr, "buChar") ? "bullet" : child(pPr, "buAutoNum") ? "number" : "none";
  return {
    runs,
    align: attribute(pPr, "algn") === "ctr" ? "center" : attribute(pPr, "algn") === "r" ? "right" : "left",
    lineHeight: Number.isFinite(lineSpacing) && lineSpacing > 0 ? Math.min(3, Math.max(0.8, lineSpacing / 100000)) : 1.15,
    spacingAfter: 0,
    list: bullet,
    indent: 0,
  };
}

function parseTextRun(
  run: XmlNode | null,
  paragraphProperties: XmlNode | null,
  source: PptxSlide,
  context: ImportContext,
): TextRun | null {
  if (!run) return null;
  const text = textContent(child(run, "t"));
  if (!text) return null;
  const properties = child(run, "rPr") ?? child(paragraphProperties, "defRPr");
  const hyperlinkId = attribute(child(properties, "hlinkClick"), "r:id");
  const hyperlinkRelationship = hyperlinkId ? source.relationships.get(hyperlinkId) : undefined;
  const hyperlink = hyperlinkRelationship && !hyperlinkRelationship.external && isHttpUrl(hyperlinkRelationship.target)
    ? hyperlinkRelationship.target
    : undefined;
  if (hyperlinkId && !hyperlink) warn(context, "unknown", "Hyperlink relationship was not imported.");
  return {
    text,
    fontFamily: attribute(child(properties, "latin"), "typeface") || context.theme.fonts.body,
    fontSize: clamp(Number(attribute(properties, "sz")) / 100 || 24, 6, 160),
    fontWeight: attribute(properties, "b") === "1" ? "700" : "400",
    italic: attribute(properties, "i") === "1",
    underline: Boolean(attribute(properties, "u") && attribute(properties, "u") !== "none"),
    color: readDrawingColor(child(properties, "solidFill"), context.theme.colors.text ?? "#0f172a"),
    ...(hyperlink ? { hyperlink } : {}),
  };
}

function parseShapeElement(
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Extract<SlideElement, { type: "shape" }> {
  const shapeProperties = child(node, "spPr");
  const primitive = attribute(child(shapeProperties, "prstGeom"), "prst") ?? "";
  const shapeMap: Record<string, Extract<SlideElement, { type: "shape" }>['shape']> = {
    rect: "rectangle",
    roundRect: "roundedRectangle",
    ellipse: "ellipse",
    triangle: "triangle",
    chevron: "chevron",
    callout1: "callout",
    hexagon: "hexagon",
  };
  const shape = shapeMap[primitive] ?? "rectangle";
  if (!shapeMap[primitive]) warn(context, slideId, `Shape “${primitive || "custom"}” was flattened to a rectangle.`, id, true);
  return {
    id,
    type: "shape",
    shape,
    frame: frameFrom(node, { x: 60, y: 60, width: 200, height: 100, rotation: 0 }),
    zIndex,
    visible: true,
    locked: false,
    semanticRole: "content",
    opacity: 1,
    fill: readDrawingColor(child(shapeProperties, "solidFill"), "#ffffff"),
    borderColor: readDrawingColor(child(child(shapeProperties, "ln"), "solidFill"), "#e2e8f0"),
    borderWidth: clamp((Number(attribute(child(shapeProperties, "ln"), "w")) || 12700) / 12700, 0, 20),
  };
}

function parseLineElement(
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Extract<SlideElement, { type: "line" | "arrow" }> {
  const shapeProperties = child(node, "spPr");
  const frame = frameFrom(node, { x: 60, y: 60, width: 200, height: 1, rotation: 0 });
  const line = child(shapeProperties, "ln");
  const endArrow = attribute(child(line, "tailEnd"), "type");
  return {
    id,
    type: endArrow && endArrow !== "none" ? "arrow" : "line",
    frame,
    zIndex,
    visible: true,
    locked: false,
    semanticRole: "content",
    opacity: 1,
    stroke: readDrawingColor(child(line, "solidFill"), "#0f172a"),
    strokeWidth: clamp((Number(attribute(line, "w")) || 12700) / 12700, 0.5, 20),
    start: { x: 0, y: 50 },
    end: { x: 100, y: 50 },
  };
}

function parseTableElement(
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Extract<SlideElement, { type: "table" }> {
  const table = child(child(child(child(node, "graphic"), "graphicData"), "tbl"), "tr");
  const rows = array(table).map((row) =>
    array(child(asNode(row), "tc")).map((cell) => textContent(child(child(asNode(cell), "txBody"), "p"))),
  );
  const borderColor = rows.length > 0 ? readTableBorderColor(table) : "#e2e8f0";
  return {
    id,
    type: "table",
    frame: frameFrom(node, { x: 60, y: 60, width: 840, height: 200, rotation: 0 }),
    zIndex,
    visible: true,
    locked: false,
    semanticRole: "table",
    opacity: 1,
    rows: rows.length > 0 ? rows : [[""]],
    headerRows: rows.length > 1 ? 1 : 0,
    borderColor,
  };
}

async function parseChartElement(
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Promise<Extract<SlideElement, { type: "chart" }> | null> {
  const chartNode = child(child(child(node, "graphic"), "graphicData"), "chart");
  const relationshipId = attribute(chartNode, "r:id");
  const relationship = relationshipId ? source.relationships.get(relationshipId) : undefined;
  if (!relationship || relationship.external) {
    warn(context, slideId, "External or missing chart relationship was not imported.", id, true);
    return null;
  }
  const chartXml = await context.zip.file(relationship.target)?.async("text");
  if (!chartXml) {
    warn(context, slideId, "Chart relationship points to a missing package part.", id, true);
    return null;
  }
  const chartRoot = asNode(context.parser.parse(chartXml));
  const chartSpace = child(chartRoot, "chartSpace");
  const plotArea = child(child(chartSpace, "chart"), "plotArea");
  const chartTypeEntry = ["barChart", "lineChart", "pieChart", "doughnutChart", "areaChart"]
    .map((name) => ({ name, node: asNode(child(plotArea, name)) }))
    .find((entry) => entry.node);
  if (!chartTypeEntry?.node) {
    warn(context, slideId, "Chart type is not supported by the presentation schema.", id, true);
    return null;
  }
  const series = array(child(chartTypeEntry.node, "ser")).map((value, index) => {
    const seriesNode = asNode(value);
    const values = chartPoints(child(child(child(seriesNode, "val"), "numRef"), "numCache"))
      .map((point) => Number(point));
    const labels = chartPoints(child(child(child(seriesNode, "cat"), "strRef"), "strCache"));
    const name = chartPoints(child(child(child(seriesNode, "tx"), "strRef"), "strCache"))[0] ?? `Series ${index + 1}`;
    return { name, labels, values };
  });
  const categories = series.find((entry) => entry.labels.length > 0)?.labels ?? ["Imported"];
  const chartType = mapChartType(chartTypeEntry.name, chartTypeEntry.node);
  return {
    id,
    type: "chart",
    chartType,
    frame: frameFrom(node, { x: 60, y: 60, width: 400, height: 240, rotation: 0 }),
    zIndex,
    visible: true,
    locked: false,
    semanticRole: "chart",
    opacity: 1,
    categories,
    series: series.length > 0
      ? series.map((entry) => ({ name: entry.name, values: entry.values.length > 0 ? entry.values : [0] }))
      : [{ name: "Series 1", values: [0] }],
  };
}

async function parseImageElement(
  node: XmlNode,
  source: PptxSlide,
  context: ImportContext,
  slideId: string,
  id: string,
  zIndex: number,
): Promise<Extract<SlideElement, { type: "image" }> | null> {
  const blip = child(child(node, "blipFill"), "blip");
  const relationshipId = attribute(blip, "r:embed");
  const relationship = relationshipId ? source.relationships.get(relationshipId) : undefined;
  if (!relationship || relationship.external) {
    warn(context, slideId, "unsupported source element: external or missing image relationship was not imported.", id, true);
    return null;
  }
  const asset = context.zip.file(relationship.target);
  if (!asset) {
    warn(context, slideId, "Image relationship points to a missing package part.", id, true);
    return null;
  }
  const bytes = await asset.async("uint8array");
  if (bytes.byteLength > context.maxAssetBytes) {
    warn(context, slideId, `Image asset exceeds the ${formatBytes(context.maxAssetBytes)} limit.`, id, true);
    return null;
  }
  const alt = attribute(child(child(node, "nvPicPr"), "cNvPr"), "descr") || id;
  const extension = relationship.target.split(".").at(-1)?.toLowerCase() ?? "png";
  const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "svg" ? "image/svg+xml" : "image/png";
  const assetId = `asset-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;
  return {
    id,
    type: "image",
    frame: frameFrom(node, { x: 60, y: 60, width: 200, height: 120, rotation: 0 }),
    zIndex,
    visible: true,
    locked: false,
    semanticRole: "image",
    opacity: 1,
    assetId,
    src: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
    alt,
  };
}

function chartPoints(cache: unknown): string[] {
  return array(child(cache, "pt"))
    .sort((left, right) => Number(attribute(left, "idx")) - Number(attribute(right, "idx")))
    .map((point) => textContent(child(asNode(point), "v")))
    .filter(Boolean);
}

function mapChartType(
  chartName: string,
  chartNode: XmlNode,
): Extract<SlideElement, { type: "chart" }>['chartType'] {
  if (chartName === "lineChart") return "line";
  if (chartName === "pieChart") return "pie";
  if (chartName === "doughnutChart") return "doughnut";
  if (chartName === "areaChart") return "area";
  const column = attribute(child(chartNode, "barDir"), "val") !== "bar";
  const stacked = attribute(child(chartNode, "grouping"), "val") === "stacked";
  if (stacked) return column ? "stackedColumn" : "stackedBar";
  return column ? "column" : "bar";
}

async function readNotes(source: PptxSlide, context: ImportContext): Promise<string | undefined> {
  const relationship = [...source.relationships.values()].find((candidate) =>
    candidate.target.includes("notesSlides"),
  );
  if (!relationship || relationship.external) return undefined;
  const notesXml = await context.zip.file(relationship.target)?.async("text");
  if (!notesXml) return undefined;
  const notesRoot = asNode(context.parser.parse(notesXml));
  const text = textContent(notesRoot);
  return text || undefined;
}

function warn(
  context: ImportContext,
  slideId: string,
  message: string,
  elementId?: string,
  unsupported = false,
): void {
  context.report.warn(slideId, message, elementId, unsupported);
}

function readTableBorderColor(table: unknown): string {
  const firstCell = asNode(array(child(asNode(table), "tc"))[0]);
  return readDrawingColor(child(child(firstCell, "tcPr"), "lnL"), "#e2e8f0");
}

function readDrawingColor(value: unknown, fallback: string): string {
  const node = asNode(value);
  const srgb = attribute(child(node, "srgbClr"), "val") || attribute(child(node, "sysClr"), "lastClr");
  if (srgb && /^[0-9a-f]{6}$/i.test(srgb)) return `#${srgb}`;
  return fallback.startsWith("#") ? fallback : `#${fallback}`;
}

function frameFrom(node: XmlNode, fallback: Rect): Rect {
  const xfrm = child(child(node, "spPr"), "xfrm") ?? child(child(node, "grpSpPr"), "xfrm");
  const off = child(xfrm, "off");
  const ext = child(xfrm, "ext");
  const x = emuToLogical(Number(attribute(off, "x")), "x");
  const y = emuToLogical(Number(attribute(off, "y")), "y");
  const width = emuToLogical(Number(attribute(ext, "cx")), "x");
  const height = emuToLogical(Number(attribute(ext, "cy")), "y");
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return fallback;
  return safeFrame({
    x,
    y,
    width,
    height: Math.max(0.1, height),
    rotation: Number(attribute(xfrm, "rot")) / 60000 || 0,
  });
}

function emuToLogical(value: number, axis: "x" | "y"): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return axis === "x"
    ? (value / EMU_PER_INCH / SLIDE_WIDTH_INCHES) * 1000
    : (value / EMU_PER_INCH / SLIDE_HEIGHT_INCHES) * 562.5;
}

function safeFrame(frame: Rect): Rect {
  const x = clamp(frame.x, 0, 999.9);
  const y = clamp(frame.y, 0, 562.4);
  return {
    x,
    y,
    width: clamp(frame.width, 0.1, 1000 - x),
    height: clamp(frame.height, 0.1, 562.5 - y),
    rotation: clamp(frame.rotation, -360, 360),
  };
}

function elementName(node: XmlNode, fallback: string): string {
  const cNvPr = child(child(node, "nvSpPr") ?? child(node, "nvPicPr") ?? child(node, "nvGraphicFramePr"), "cNvPr");
  const name = attribute(cNvPr, "name");
  return name ? `${fallback}-${name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40)}` : fallback;
}

function paragraphText(paragraph: Paragraph | undefined): string {
  return paragraph?.runs.map((run) => run.text).join("") || "";
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  const node = asNode(value);
  if (!node) return "";
  if (typeof node["#text"] === "string") return String(node["#text"]).replace(/\s+/g, " ").trim();
  return Object.entries(node)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, childValue]) => textContent(childValue))
    .filter(Boolean)
    .join("");
}

function asNode(value: unknown): XmlNode | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlNode) : null;
}

function child(value: unknown, key: string): unknown {
  const node = asNode(value);
  return node?.[key];
}

function array(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function attribute(value: unknown, name: string): string | undefined {
  const node = asNode(value);
  const candidate = node?.[`@_${name}`] ?? node?.[`@_${name.split(":").at(-1) ?? name}`];
  return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : undefined;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function formatBytes(value: number): string {
  return `${Math.round(value / 1024 / 1024)} MB`;
}
