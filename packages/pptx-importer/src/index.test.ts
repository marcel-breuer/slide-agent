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
    expect(document.slides[0]?.elements).toHaveLength(3);
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

  it("converts structured OOXML elements, relationships, theme fonts, and assets", async () => {
    const bytes = await createStructuredPptxFixture();
    const { document, report } = await importPptxPackage(bytes, {
      now: "2026-07-03T10:00:00.000Z",
      ownerId: "user-1",
      presentationId: "presentation-structured",
      title: "Structured deck",
    });
    const types = document.slides[0]?.elements.map((element) => element.type) ?? [];

    expect(document.theme.fonts).toEqual({ heading: "Arial", body: "Aptos" });
    expect(document.slides[0]?.layoutId).toBe("slideLayout1");
    expect(types).toEqual(expect.arrayContaining(["text", "shape", "table", "chart", "image", "group"]));
    expect(document.slides[0]?.elements.find((element) => element.type === "image")).toMatchObject({
      src: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(report.unsupportedElementCount).toBe(0);
    expect(report.elementWarnings).toHaveLength(0);
  });

  it("rejects malformed XML, unsafe paths, and reports oversized assets", async () => {
    const malformed = await createPptxFixture({ slides: [{ text: ["Status"] }] });
    const malformedZip = await JSZip.loadAsync(malformed);
    malformedZip.file("ppt/slides/slide1.xml", "<p:sld>");
    await expect(
      inspectPptxPackage(await malformedZip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("malformed XML");

    const unsafeZip = await JSZip.loadAsync(await createPptxFixture({ slides: [{ text: ["Status"] }] }));
    unsafeZip.file("../escape.xml", "unsafe");
    await expect(inspectPptxPackage(await unsafeZip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      "unsafe paths",
    );

    const report = await inspectPptxPackage(await createStructuredPptxFixture(), { maxAssetBytes: 1 });
    expect(report.warnings.join(" ")).toContain("asset exceeds");
    expect(report.unsupportedElementCount).toBeGreaterThan(0);
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

async function createStructuredPptxFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\" />");
  zip.file(
    "ppt/presentation.xml",
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="theme/theme1.xml"/></Relationships>`,
  );
  zip.file(
    "ppt/theme/theme1.xml",
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:accent1><a:srgbClr val="9333EA"/></a:accent1><a:accent2><a:srgbClr val="7C3AED"/></a:accent2><a:accent3><a:srgbClr val="64748B"/></a:accent3></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="400000"/><a:ext cx="7000000" cy="800000"/></a:xfrm><a:prstGeom prst="roundRect"/><a:solidFill><a:srgbClr val="F3E8FF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400" b="1"><a:solidFill><a:srgbClr val="9333EA"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Structured title</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Rectangle"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="1500000"/><a:ext cx="2500000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></p:spPr></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table"/></p:nvGraphicFramePr><p:xfrm><a:off x="3500000" y="1500000"/><a:ext cx="3000000" cy="1200000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Pipeline</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>76</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Chart"/></p:nvGraphicFramePr><p:xfrm><a:off x="7000000" y="1500000"/><a:ext cx="3000000" cy="2000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame><p:pic><p:nvPicPr><p:cNvPr id="6" name="Logo" descr="Logo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="500000" y="3500000"/><a:ext cx="1000000" cy="700000"/></a:xfrm></p:spPr></p:pic><p:grpSp><p:grpSpPr><a:xfrm><a:off x="500000" y="4300000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="7" name="Grouped shape"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="600000" y="4400000"/><a:ext cx="500000" cy="500000"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="16A34A"/></a:solidFill></p:spPr></p:sp></p:grpSp></p:spTree></p:cSld></p:sld>`,
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../charts/chart1.xml"/><Relationship Id="rId3" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
  );
  zip.file("ppt/media/image1.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  zip.file(
    "ppt/charts/chart1.xml",
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Pipeline</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Jul</c:v></c:pt><c:pt idx="1"><c:v>Aug</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>42</c:v></c:pt><c:pt idx="1"><c:v>76</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}
