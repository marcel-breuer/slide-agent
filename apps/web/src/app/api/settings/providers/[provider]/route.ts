import { z } from "zod";

import { encryptCredential } from "@slide-agent/auth";

import { fail, ok } from "@/lib/api";

const ProviderCredentialSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().default(true)
});

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const parsed = ProviderCredentialSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_FAILED", "Provider credential input is invalid.");
  const params = await context.params;
  const encrypted = parsed.data.apiKey
    ? encryptCredential(parsed.data.apiKey, process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key")
    : null;
  return ok({
    provider: params.provider,
    enabled: parsed.data.enabled,
    maskedValue: encrypted?.metadata.maskedValue ?? null
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params;
  return ok({ provider: params.provider, deleted: true });
}
