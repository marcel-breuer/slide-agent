"use client";

import { PresentationPreview } from "@/components/presentation-preview";
import { SlideRenderer } from "@slide-agent/presentation-renderer";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

const FIXTURE_TIME = "2026-07-13T10:00:00.000Z";
const PRESENTATION = createDemoPresentationDocument({
  now: FIXTURE_TIME,
  ownerId: "visual-regression-fixture",
});
const SLIDE = PRESENTATION.slides[0]!;

type VisualMode = "editor" | "preview" | "exported";

export function VisualFixture({ mode }: { mode: VisualMode }) {
  if (mode === "preview") {
    return (
      <div data-visual-mode={mode}>
        <PresentationPreview
          initialSlideId={SLIDE.id}
          onClose={() => undefined}
          presentation={PRESENTATION}
        />
      </div>
    );
  }

  return (
    <main
      data-visual-mode={mode}
      style={{
        background: mode === "editor" ? "#e2e8f0" : "#0f172a",
        color: "#0f172a",
        minHeight: "900px",
        padding: mode === "editor" ? "28px" : "0",
        width: "1600px",
      }}
    >
      {mode === "editor" ? <EditorFixtureChrome /> : null}
      <div
        data-testid="visual-slide"
        style={{
          boxShadow: mode === "editor" ? "0 24px 60px rgb(15 23 42 / 0.18)" : undefined,
          margin: mode === "editor" ? "32px auto 0" : undefined,
          width: mode === "editor" ? "1280px" : "1600px",
        }}
      >
        <SlideRenderer
          interactionMode={mode === "exported" ? "preview" : "select"}
          presentation={PRESENTATION}
          selectedElementIds={mode === "editor" ? ["title"] : []}
          slide={SLIDE}
        />
      </div>
    </main>
  );
}

function EditorFixtureChrome() {
  return (
    <header
      style={{
        alignItems: "center",
        background: "#ffffff",
        borderRadius: "12px",
        display: "flex",
        height: "48px",
        justifyContent: "space-between",
        padding: "0 18px",
      }}
    >
      <strong style={{ color: "#0f172a", fontSize: "16px" }}>Slide Agent · Editor</strong>
      <span style={{ color: "#64748b", fontSize: "12px" }}>1600 × 900 · deterministic fixture</span>
    </header>
  );
}
