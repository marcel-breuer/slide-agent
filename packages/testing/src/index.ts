import type { PresentationDocument } from "@slide-agent/presentation-schema";

export function makeTestPresentation(overrides: Partial<PresentationDocument> = {}): PresentationDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    id: "test-deck",
    title: "Test Deck",
    locale: "en",
    format: "WIDE_16_9",
    theme: {
      colors: { text: "#0f172a", primary: "#9333ea" },
      fonts: { heading: "Inter", body: "Inter" }
    },
    metadata: { createdAt: now, updatedAt: now, ownerId: "test-user" },
    slides: [],
    ...overrides
  };
}
