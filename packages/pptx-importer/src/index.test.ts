import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { importPptxPackage, inspectPptxPackage } from "./index";

describe("PPTX importer", () => {
  it("converts slide text into an editable presentation document", async () => {
    const bytes = await createPptxFixture({
      slides: [
        {
          text: ["Quarterly Review", "Pipeline improved", "Delivery risk remains"],
          unsupportedXml: "<p:pic><p:nvPicPr /></p:pic>",
        },
        { text: ["Next steps", "Approve support plan"] },
      ],
    });

    const { document, report } = await importPptxPackage(bytes, {
      now: "2026-07-03T10:00:00.000Z",
      ownerId: "user-1",
      presentationId: "presentation-1",
      title: "Imported deck",
    });

    expect(document.id).toBe("presentation-1");
    expect(document.title).toBe("Imported deck");
    expect(document.metadata.ownerId).toBe("user-1");
    expect(document.slides).toHaveLength(2);
    expect(document.slides[0]?.title).toBe("Quarterly Review");
    expect(document.slides[0]?.elements).toHaveLength(2);
    expect(report).toMatchObject({
      importedSlideCount: 2,
      fullyEditableElementCount: 5,
      unsupportedElementCount: 1,
    });
    expect(report.warnings.join(" ")).toContain("unsupported source element");
  });

  it("inspects a package without building a presentation document", async () => {
    const bytes = await createPptxFixture({ slides: [{ text: ["Status"] }] });

    await expect(inspectPptxPackage(bytes)).resolves.toMatchObject({
      importedSlideCount: 1,
      fullyEditableElementCount: 1,
    });
  });

  it("rejects files that are not PowerPoint packages", async () => {
    await expect(
      importPptxPackage(new Uint8Array([110, 111, 116, 32, 97, 32, 112, 112, 116, 120]), {
        ownerId: "user-1",
        presentationId: "presentation-1",
        title: "Broken",
      }),
    ).rejects.toThrow("ZIP-based PowerPoint");
  });
});

async function createPptxFixture({
  slides,
}: {
  slides: Array<{ text: string[]; unsupportedXml?: string }>;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
    </Types>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("")}</p:sldIdLst>
    </p:presentation>`,
  );

  slides.forEach((slide, index) => {
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld>
          <p:spTree>
            ${slide.text
              .map(
                (text) => `
                <p:sp>
                  <p:txBody>
                    <a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p>
                  </p:txBody>
                </p:sp>`,
              )
              .join("")}
            ${slide.unsupportedXml ?? ""}
          </p:spTree>
        </p:cSld>
      </p:sld>`,
    );
  });

  return zip.generateAsync({ type: "uint8array" });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
