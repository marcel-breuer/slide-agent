import { describe, expect, it } from "vitest";

import { enforceSlideLimit, validatePresentation } from "./index";

describe("presentation schema", () => {
  it("validates a minimal structured presentation", () => {
    const now = new Date().toISOString();

    const document = validatePresentation({
      schemaVersion: "1.0.0",
      id: "deck_1",
      title: "Quarterly Review",
      locale: "en",
      format: "WIDE_16_9",
      theme: {
        colors: { primary: "#9333ea", text: "#0f172a" },
        fonts: { heading: "Inter", body: "Inter" }
      },
      metadata: { createdAt: now, updatedAt: now, ownerId: "user_1" },
      slides: [
        {
          id: "slide_1",
          order: 1,
          background: { type: "solid", color: "#ffffff" },
          pointers: [
            {
              id: "pointer_1",
              label: "1",
              x: 250,
              y: 180,
              instruction: "Make this metric stand out"
            }
          ],
          elements: [
            {
              id: "title",
              type: "text",
              frame: { x: 80, y: 64, width: 820, height: 80, rotation: 0 },
              zIndex: 1,
              visible: true,
              locked: false,
              semanticRole: "title",
              paragraphs: [{ runs: [{ text: "Quarterly Review" }] }]
            }
          ]
        }
      ]
    });

    expect(document.slides).toHaveLength(1);
    expect(document.slides[0]?.pointers).toHaveLength(1);
  });

  it("enforces the lowest configured slide limit", () => {
    expect(enforceSlideLimit(60, 45, 30)).toBe(30);
    expect(enforceSlideLimit(0, 45, 30)).toBe(1);
  });
});
