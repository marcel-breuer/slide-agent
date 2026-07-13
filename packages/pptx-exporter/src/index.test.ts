import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument, type PresentationDocument } from "@slide-agent/presentation-schema";

import { exportPresentation } from "./index";

describe("PPTX exporter", () => {
  it("generates a PowerPoint-compatible deck package", async () => {
    const document = createDemoPresentationDocument({
      now: "2026-07-03T10:00:00.000Z",
      ownerId: "demo-user",
    });

    const { buffer, report } = await exportPresentation(document);
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter((path) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(path),
    );

    expect(buffer.length).toBeGreaterThan(0);
    expect(zip.file("ppt/presentation.xml")).toBeTruthy();
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(slideFiles).toHaveLength(document.slides.length);
    expect(report).toMatchObject({
      slideCount: document.slides.length,
      elementCount: document.slides.reduce((sum, slide) => sum + slide.elements.length, 0),
    });
  });

  it("can omit speaker notes from the generated deck", async () => {
    const document = createDemoPresentationDocument({
      now: "2026-07-03T10:00:00.000Z",
      ownerId: "demo-user",
    });

    const { buffer } = await exportPresentation(document, { includeSpeakerNotes: false });
    const zip = await JSZip.loadAsync(buffer);
    const speakerNotes = document.slides[0]?.speakerNotes;
    if (!speakerNotes) throw new Error("Expected demo slide to include speaker notes.");
    const noteFiles = Object.keys(zip.files).filter((path) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path),
    );
    const noteXml = await Promise.all(noteFiles.map((path) => zip.file(path)?.async("string")));

    expect(noteXml.join("\n")).not.toContain(speakerNotes);
  });

  it("preserves native structure and package relationships for a mixed fixture", async () => {
    const document = createMixedFixture();
    const { buffer, report } = await exportPresentation(document, {
      resolveAsset: (assetId) =>
        assetId === "logo"
          ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
          : undefined,
    });
    const zip = await JSZip.loadAsync(buffer);
    const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
    const slideRelationships = await zip
      .file("ppt/slides/_rels/slide1.xml.rels")
      ?.async("string");
    const chartXml = await zip.file("ppt/charts/chart1.xml")?.async("string");

    expect(report).toMatchObject({
      nativeChartCount: 1,
      flattenedGroupCount: 1,
      svgFallbackCount: 1,
      pngFallbackCount: 2,
    });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("flattened"),
        expect.stringContaining("was not embedded"),
      ]),
    );
    expect(slideXml).toContain("roundRect");
    expect(slideXml).toContain("rId1");
    expect(slideRelationships).toContain("chart1.xml");
    expect(chartXml).toContain("Pipeline");
    expect(zip.file("ppt/slideMasters/slideMaster1.xml")).toBeTruthy();
    await expectPackageRelationshipsToResolve(zip);
  });

  it("produces deterministic bytes for the same source document", async () => {
    const document = createDemoPresentationDocument({
      now: "2026-07-03T10:00:00.000Z",
      ownerId: "demo-user",
    });

    const first = await exportPresentation(document);
    const second = await exportPresentation(document);

    expect(first.buffer.equals(second.buffer)).toBe(true);
  });
});

function createMixedFixture(): PresentationDocument {
  const document = createDemoPresentationDocument({
    now: "2026-07-03T10:00:00.000Z",
    ownerId: "demo-user",
  });
  const slide = document.slides[0];
  if (!slide) throw new Error("Expected a demo slide.");
  slide.layoutId = "executive-master";
  slide.elements.push(
    {
      id: "table",
      type: "table",
      frame: { x: 60, y: 490, width: 400, height: 50, rotation: 0 },
      zIndex: 6,
      visible: true,
      locked: false,
      semanticRole: "table",
      opacity: 1,
      rows: [["Metric", "Value"], ["Pipeline", "76"]],
      headerRows: 1,
      borderColor: "#cbd5e1",
    },
    {
      id: "logo",
      type: "image",
      frame: { x: 860, y: 42, width: 50, height: 30, rotation: 0 },
      zIndex: 7,
      visible: true,
      locked: false,
      semanticRole: "logo",
      opacity: 1,
      assetId: "logo",
      src: "asset://logo",
      alt: "Company logo",
    },
    {
      id: "missing-image",
      type: "image",
      frame: { x: 860, y: 80, width: 50, height: 30, rotation: 0 },
      zIndex: 8,
      visible: true,
      locked: false,
      semanticRole: "image",
      opacity: 1,
      assetId: "missing",
      src: "https://private.example/assets/missing.png",
      alt: "Missing asset",
    },
    {
      id: "icon",
      type: "icon",
      frame: { x: 920, y: 42, width: 20, height: 20, rotation: 0 },
      zIndex: 9,
      visible: true,
      locked: false,
      semanticRole: "icon",
      opacity: 1,
      icon: "check",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M1 5 4 8 9 2\"/></svg>",
      color: "#16a34a",
      strokeWidth: 2,
    },
    {
      id: "group",
      type: "group",
      frame: { x: 60, y: 490, width: 400, height: 50, rotation: 0 },
      zIndex: 10,
      visible: true,
      locked: false,
      semanticRole: "group",
      opacity: 1,
      children: ["table"],
    },
  );
  return document;
}

async function expectPackageRelationshipsToResolve(zip: JSZip): Promise<void> {
  for (const relationshipPath of Object.keys(zip.files).filter((path) => path.endsWith(".rels"))) {
    const xml = await zip.file(relationshipPath)?.async("string");
    if (!xml) continue;
    const relationshipMatches = xml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/g);
    for (const match of relationshipMatches) {
      const target = match[1];
      if (!target || target.startsWith("http") || target.startsWith("mailto:")) continue;
      const packagePath = resolvePackagePath(relationshipPath, target);
      expect(zip.file(packagePath), `${relationshipPath} -> ${target}`).toBeTruthy();
    }
  }
}

function resolvePackagePath(relationshipPath: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const sourceDirectory = relationshipPath.startsWith("_rels/")
    ? ""
    : relationshipPath.replace(/\/_rels\/[^/]+\.rels$/, "");
  const segments = `${sourceDirectory}/${target.replace(/^\//, "")}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}
