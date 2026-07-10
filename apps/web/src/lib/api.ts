import { z } from "zod";

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export const ProjectInputSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  name: z.string().trim().min(1).max(160),
});

export const PresentationInputSchema = z.object({
  designProfileId: z.string().trim().min(1).optional(),
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  requestedSlideCount: z.number().int().min(1).max(50).optional(),
});

export const DesignProfileDefinitionSchema = z.object({
  colors: z
    .array(
      z.object({
        hex: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/),
        name: z.string().trim().min(1).max(80),
        role: z.string().trim().min(1).max(80),
      }),
    )
    .max(24)
    .default([]),
  fonts: z
    .array(
      z.object({
        family: z.string().trim().min(1).max(120),
        role: z.string().trim().min(1).max(80),
        weight: z.string().trim().max(40).optional(),
      }),
    )
    .max(12)
    .default([]),
  layoutRules: z.array(z.string().trim().min(1).max(240)).max(24).default([]),
  logos: z
    .array(
      z.object({
        altText: z.string().trim().min(1).max(160),
        placement: z.string().trim().min(1).max(120),
        storageKey: z.string().trim().max(240).optional(),
      }),
    )
    .max(12)
    .default([]),
  previewCards: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(240),
        title: z.string().trim().min(1).max(120),
      }),
    )
    .max(8)
    .default([]),
  sourceEvidence: z.array(z.string().trim().min(1).max(280)).max(24).default([]),
});

export const DesignProfileInputSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  profile: DesignProfileDefinitionSchema,
});

export const DesignProfileImportSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  profile: DesignProfileDefinitionSchema,
  sourceEvidence: z.array(z.string().trim().min(1).max(280)).max(24).default([]),
  sourceType: z.string().trim().min(1).max(80).default("import"),
});
