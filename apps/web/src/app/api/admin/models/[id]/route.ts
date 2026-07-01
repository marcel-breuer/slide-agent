import { ok } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return ok({ id: params.id, ...(await request.json()) });
}
