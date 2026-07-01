import { z } from "zod";

export const PRESENTATION_SCHEMA_VERSION = "1.0.0";
export const SLIDE_FORMAT = "WIDE_16_9";
export const LOGICAL_SLIDE_WIDTH = 1000;
export const LOGICAL_SLIDE_HEIGHT = 562.5;
export const GLOBAL_MAX_SLIDES = 50;

export const LocaleSchema = z.enum(["en", "de"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const RectSchema = z.object({
  x: z.number().finite().min(0).max(LOGICAL_SLIDE_WIDTH),
  y: z.number().finite().min(0).max(LOGICAL_SLIDE_HEIGHT),
  width: z.number().finite().positive().max(LOGICAL_SLIDE_WIDTH),
  height: z.number().finite().positive().max(LOGICAL_SLIDE_HEIGHT),
  rotation: z.number().finite().min(-360).max(360).default(0)
});
export type Rect = z.infer<typeof RectSchema>;

export const ElementBaseSchema = z.object({
  id: z.string().min(1),
  frame: RectSchema,
  zIndex: z.number().int().min(0),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  semanticRole: z.string().min(1).default("content"),
  accessibilityLabel: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1)
});

export const ColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected a hex color");

export const TextRunSchema = z.object({
  text: z.string(),
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().min(6).max(160).default(24),
  fontWeight: z.enum(["400", "500", "600", "700"]).default("400"),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  color: ColorSchema.default("#0f172a"),
  hyperlink: z.string().url().optional()
});
export type TextRun = z.infer<typeof TextRunSchema>;

export const ParagraphSchema = z.object({
  runs: z.array(TextRunSchema).min(1),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().min(0.8).max(3).default(1.15),
  spacingAfter: z.number().min(0).default(0),
  list: z.enum(["none", "bullet", "number"]).default("none"),
  indent: z.number().min(0).default(0)
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

const TextElementSchema = ElementBaseSchema.extend({
  type: z.literal("text"),
  paragraphs: z.array(ParagraphSchema).min(1),
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  autoFit: z
    .object({
      enabled: z.boolean().default(true),
      minFontSize: z.number().min(6).max(160).default(10),
      maxFontSize: z.number().min(6).max(160).default(48)
    })
    .default({ enabled: true, minFontSize: 10, maxFontSize: 48 })
});

const ShapeElementSchema = ElementBaseSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rectangle", "roundedRectangle", "ellipse", "triangle", "chevron", "callout", "hexagon"]),
  fill: ColorSchema.default("#ffffff"),
  borderColor: ColorSchema.default("#e2e8f0"),
  borderWidth: z.number().min(0).max(20).default(1)
});

const ImageElementSchema = ElementBaseSchema.extend({
  type: z.literal("image"),
  assetId: z.string(),
  src: z.string(),
  alt: z.string().min(1),
  crop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1)
    })
    .optional()
});

const IconElementSchema = ElementBaseSchema.extend({
  type: z.literal("icon"),
  icon: z.string().min(1),
  svg: z.string().optional(),
  color: ColorSchema.default("#0f172a"),
  strokeWidth: z.number().min(0.5).max(6).default(2)
});

const LineElementSchema = ElementBaseSchema.extend({
  type: z.enum(["line", "arrow"]),
  stroke: ColorSchema.default("#0f172a"),
  strokeWidth: z.number().min(0.5).max(20).default(2),
  start: z.object({ x: z.number(), y: z.number() }),
  end: z.object({ x: z.number(), y: z.number() })
});

const TableElementSchema = ElementBaseSchema.extend({
  type: z.literal("table"),
  rows: z.array(z.array(z.string())).min(1),
  headerRows: z.number().int().min(0).default(1),
  borderColor: ColorSchema.default("#e2e8f0")
});

const ChartElementSchema = ElementBaseSchema.extend({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "column", "line", "pie", "doughnut", "area", "stackedBar", "stackedColumn"]),
  categories: z.array(z.string()).min(1),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1)
});

const GroupElementSchema = ElementBaseSchema.extend({
  type: z.literal("group"),
  children: z.array(z.string()).min(1)
});

export const SlideElementSchema = z.discriminatedUnion("type", [
  TextElementSchema,
  ShapeElementSchema,
  ImageElementSchema,
  IconElementSchema,
  LineElementSchema,
  TableElementSchema,
  ChartElementSchema,
  GroupElementSchema
]);
export type SlideElement = z.infer<typeof SlideElementSchema>;

export const SlideBackgroundSchema = z.object({
  type: z.enum(["solid", "gradient", "image"]).default("solid"),
  color: ColorSchema.default("#ffffff"),
  assetId: z.string().optional()
});

export const SlideDocumentSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  title: z.string().optional(),
  purpose: z.string().optional(),
  keyMessage: z.string().optional(),
  layoutId: z.string().optional(),
  background: SlideBackgroundSchema,
  elements: z.array(SlideElementSchema),
  speakerNotes: z.string().optional(),
  sources: z.array(z.object({ label: z.string(), url: z.string().url().optional() })).default([]),
  aiMetadata: z
    .object({
      operationId: z.string(),
      promptVersion: z.string(),
      generatedAt: z.string().datetime()
    })
    .optional(),
  validation: z
    .object({
      status: z.enum(["passed", "warning", "failed"]),
      warnings: z.array(z.string()).default([])
    })
    .optional()
});
export type SlideDocument = z.infer<typeof SlideDocumentSchema>;

export const PresentationDocumentSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  locale: LocaleSchema.default("en"),
  format: z.literal(SLIDE_FORMAT),
  theme: z.object({
    colors: z.record(ColorSchema),
    fonts: z.object({
      heading: z.string(),
      body: z.string()
    })
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    ownerId: z.string()
  }),
  slides: z.array(SlideDocumentSchema).max(GLOBAL_MAX_SLIDES)
});
export type PresentationDocument = z.infer<typeof PresentationDocumentSchema>;

export function validatePresentation(input: unknown): PresentationDocument {
  return PresentationDocumentSchema.parse(input);
}

export function enforceSlideLimit(requested: number, adminMaximum: number, userMaximum: number): number {
  return Math.max(1, Math.min(GLOBAL_MAX_SLIDES, adminMaximum, userMaximum, requested));
}

export function migratePresentationDocument(input: unknown): PresentationDocument {
  const candidate = z.object({ schemaVersion: z.string() }).passthrough().parse(input);

  if (candidate.schemaVersion === PRESENTATION_SCHEMA_VERSION) {
    return validatePresentation(input);
  }

  throw new Error(`Unsupported presentation schema version: ${candidate.schemaVersion}`);
}

export const DEMO_PRESENTATION_ID = "demo-presentation";
export const DEMO_PRESENTATION_TITLE = "Q3 Operating Review";

export function createDemoPresentationDocument({
  ownerId = "demo-user",
  now = new Date().toISOString()
}: {
  ownerId?: string;
  now?: string;
} = {}): PresentationDocument {
  return validatePresentation({
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    id: DEMO_PRESENTATION_ID,
    title: DEMO_PRESENTATION_TITLE,
    locale: "en",
    format: SLIDE_FORMAT,
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
      ownerId
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
}
