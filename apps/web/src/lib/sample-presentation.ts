import { validatePresentation, type PresentationDocument } from "@slide-agent/presentation-schema";

const now = new Date().toISOString();

export const samplePresentation: PresentationDocument = validatePresentation({
  schemaVersion: "1.0.0",
  id: "demo-presentation",
  title: "Q3 Operating Review",
  locale: "en",
  format: "WIDE_16_9",
  theme: {
    colors: {
      text: "#0f172a",
      primary: "#9333ea",
      accent: "#7c3aed",
      muted: "#64748b"
    },
    fonts: {
      heading: "Inter",
      body: "Inter"
    }
  },
  metadata: {
    createdAt: now,
    updatedAt: now,
    ownerId: "demo-user"
  },
  slides: [
    {
      id: "slide-1",
      order: 1,
      title: "Executive summary",
      purpose: "Show Q3 progress and focus areas",
      keyMessage: "Revenue quality improved while delivery risk needs attention.",
      background: { type: "solid", color: "#ffffff" },
      speakerNotes: "Open with the net progress, then call out the delivery risk before budget.",
      sources: [],
      elements: [
        {
          id: "title",
          type: "text",
          frame: { x: 60, y: 42, width: 720, height: 70, rotation: 0 },
          zIndex: 4,
          visible: true,
          locked: false,
          semanticRole: "title",
          paragraphs: [
            {
              runs: [
                {
                  text: "Revenue quality improved; delivery risk remains",
                  fontSize: 31,
                  fontWeight: "700",
                  color: "#0f172a"
                }
              ]
            }
          ]
        },
        {
          id: "accent-shape",
          type: "shape",
          shape: "roundedRectangle",
          frame: { x: 60, y: 136, width: 244, height: 172, rotation: 0 },
          zIndex: 1,
          visible: true,
          locked: false,
          semanticRole: "metric-card",
          fill: "#f3e8ff",
          borderColor: "#d8b4fe",
          borderWidth: 1
        },
        {
          id: "metric-text",
          type: "text",
          frame: { x: 84, y: 160, width: 196, height: 120, rotation: 0 },
          zIndex: 5,
          visible: true,
          locked: false,
          semanticRole: "metric",
          paragraphs: [
            { runs: [{ text: "+18%", fontSize: 38, fontWeight: "700", color: "#9333ea" }] },
            { runs: [{ text: "qualified pipeline", fontSize: 16, fontWeight: "600", color: "#0f172a" }] },
            { runs: [{ text: "Driven by enterprise renewals", fontSize: 12, color: "#64748b" }] }
          ]
        },
        {
          id: "chart",
          type: "chart",
          chartType: "column",
          frame: { x: 346, y: 145, width: 270, height: 160, rotation: 0 },
          zIndex: 3,
          visible: true,
          locked: false,
          semanticRole: "chart",
          categories: ["Jul", "Aug", "Sep"],
          series: [{ name: "Pipeline", values: [42, 58, 76] }]
        },
        {
          id: "callout",
          type: "shape",
          shape: "roundedRectangle",
          frame: { x: 654, y: 136, width: 286, height: 172, rotation: 0 },
          zIndex: 1,
          visible: true,
          locked: false,
          semanticRole: "risk-card",
          fill: "#faf5ff",
          borderColor: "#e9d5ff",
          borderWidth: 1
        },
        {
          id: "risk-text",
          type: "text",
          frame: { x: 680, y: 160, width: 234, height: 120, rotation: 0 },
          zIndex: 5,
          visible: true,
          locked: false,
          semanticRole: "callout",
          paragraphs: [
            { runs: [{ text: "Delivery risk", fontSize: 22, fontWeight: "700", color: "#7e22ce" }] },
            {
              runs: [
                {
                  text: "Three critical dependencies need executive attention before October.",
                  fontSize: 15,
                  color: "#0f172a"
                }
              ]
            }
          ]
        },
        {
          id: "bottom-line",
          type: "line",
          frame: { x: 60, y: 350, width: 880, height: 1, rotation: 0 },
          zIndex: 2,
          visible: true,
          locked: true,
          semanticRole: "divider",
          stroke: "#e2e8f0",
          strokeWidth: 2,
          start: { x: 0, y: 50 },
          end: { x: 100, y: 50 }
        },
        {
          id: "next-steps",
          type: "text",
          frame: { x: 62, y: 382, width: 850, height: 94, rotation: 0 },
          zIndex: 4,
          visible: true,
          locked: false,
          semanticRole: "body",
          paragraphs: [
            { runs: [{ text: "Recommended next steps", fontSize: 18, fontWeight: "700", color: "#0f172a" }] },
            {
              runs: [
                {
                  text: "Approve incremental delivery support, keep marketing spend flat, and revisit forecast confidence in two weeks.",
                  fontSize: 17,
                  color: "#334155"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});
