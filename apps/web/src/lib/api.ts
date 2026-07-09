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
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  requestedSlideCount: z.number().int().min(1).max(50).default(10),
});
