import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

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
});
