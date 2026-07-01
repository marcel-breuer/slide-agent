import { ok } from "@/lib/api";

export async function POST(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params;
  return ok({ provider: params.provider, valid: true });
}
