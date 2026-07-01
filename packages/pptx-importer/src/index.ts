import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type PptxImportReport = {
  importedSlideCount: number;
  importedElementCount: number;
  fullyEditableElementCount: number;
  partiallyEditableElementCount: number;
  unsupportedElementCount: number;
  warnings: string[];
};

const PPTX_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

export function assertPptxSignature(bytes: Uint8Array): void {
  if (bytes.length < PPTX_SIGNATURE.length) throw new Error("PPTX file is too small.");
  for (let index = 0; index < PPTX_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PPTX_SIGNATURE[index]) {
      throw new Error("File is not a ZIP-based PowerPoint package.");
    }
  }
}

export async function inspectPptxPackage(bytes: Uint8Array): Promise<PptxImportReport> {
  assertPptxSignature(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);

  if (!names.includes("[Content_Types].xml") || !names.includes("ppt/presentation.xml")) {
    throw new Error("PPTX package is missing required OOXML parts.");
  }

  if (names.some((name) => name.includes(".."))) {
    throw new Error("PPTX package contains unsafe paths.");
  }

  const parser = new XMLParser({ ignoreAttributes: false });
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) throw new Error("PPTX package is missing ppt/presentation.xml.");
  const parsed = parser.parse(presentationXml) as Record<string, unknown>;
  const slideCount = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;

  return {
    importedSlideCount: slideCount,
    importedElementCount: 0,
    fullyEditableElementCount: 0,
    partiallyEditableElementCount: 0,
    unsupportedElementCount: 0,
    warnings: parsed ? ["Initial package inspection completed; detailed element conversion is limited in this MVP slice."] : []
  };
}
