import { z } from "zod";

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export const ProjectInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const PresentationInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  requestedSlideCount: z.number().int().min(1).max(50).default(10),
});
