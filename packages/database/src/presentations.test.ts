import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { buildPresentationDocument, findPresentationDocument, type PresentationLookupClient } from "./presentations";

describe("presentation document lookup", () => {
  it("returns null when the presentation does not exist", async () => {
    const client: PresentationLookupClient = {
      presentation: {
        async findUnique() {
          return null;
        }
      }
    };

    await expect(findPresentationDocument(client, "missing")).resolves.toBeNull();
  });

  it("builds a schema-valid document from presentation and slide rows", async () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });
    const client: PresentationLookupClient = {
      presentation: {
        async findUnique() {
          return {
            id: demo.id,
            ownerId: "user-1",
            title: demo.title,
            format: demo.format,
            outputLanguage: demo.locale,
            designContext: { theme: demo.theme },
            createdAt: now,
            updatedAt: now,
            slides: demo.slides.map((slide) => ({
              id: slide.id,
              order: slide.order,
              document: slide
            }))
          };
        }
      }
    };

    const document = await findPresentationDocument(client, demo.id);

    expect(document?.id).toBe("demo-presentation");
    expect(document?.metadata.ownerId).toBe("user-1");
    expect(document?.slides).toHaveLength(1);
    expect(document?.slides[0]?.title).toBe("Executive summary");
  });

  it("falls back to safe presentation-level values before schema validation", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });

    const document = buildPresentationDocument({
      id: demo.id,
      ownerId: "user-1",
      title: demo.title,
      format: "UNKNOWN",
      outputLanguage: "fr",
      designContext: null,
      createdAt: now,
      updatedAt: now,
      slides: demo.slides.map((slide) => ({
        id: slide.id,
        order: slide.order,
        document: slide
      }))
    });

    expect(document.format).toBe("WIDE_16_9");
    expect(document.locale).toBe("en");
  });
});
