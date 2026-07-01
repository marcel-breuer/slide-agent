import { z } from "zod";

import { hashPassword } from "@slide-agent/auth";

import { fail, ok } from "@/lib/api";

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string()
});

export async function POST(request: Request) {
  const parsed = ResetPasswordSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_FAILED", "The password reset request is invalid.");
  await hashPassword(parsed.data.password);
  return ok({ passwordReset: true });
}
