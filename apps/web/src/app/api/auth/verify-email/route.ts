import { fail, ok } from "@/lib/api";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string };
  if (!body.token) return fail("VALIDATION_FAILED", "Verification token is required.");
  return ok({ verified: true });
}
