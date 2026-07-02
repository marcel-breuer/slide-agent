import { z } from "zod";

import { createDefaultProviders } from "@slide-agent/ai-providers";
import { decryptCredential } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

const ProviderVerificationSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional()
});

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const params = await context.params;
  const provider = createDefaultProviders().find((candidate) => candidate.id === params.provider);
  if (!provider) return fail("PROVIDER_UNSUPPORTED", "Provider is not supported.", 404);

  const parsed = ProviderVerificationSchema.safeParse(await readOptionalJson(request));
  if (!parsed.success) return fail("VALIDATION_FAILED", "Provider verification input is invalid.");

  const storedCredential = await prisma.providerCredential.findUnique({
    where: { userId_provider: { userId, provider: params.provider } }
  });
  const configuration = await prisma.providerConfiguration.findFirst({
    where: { provider: params.provider, enabled: true }
  });
  const apiKey =
    parsed.data.apiKey ??
    (storedCredential?.enabled
      ? decryptCredential(
          {
            algorithm: "aes-256-gcm",
            authTag: storedCredential.authTag,
            ciphertext: storedCredential.ciphertext,
            keyVersion: storedCredential.keyVersion,
            nonce: storedCredential.nonce,
            metadata: {
              createdAt: storedCredential.createdAt.toISOString(),
              maskedValue: storedCredential.maskedValue
            }
          },
          process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key"
        )
      : undefined);

  const baseUrl = parsed.data.baseUrl ?? configuration?.baseUrl;
  const validation = await provider.validateCredential({
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {})
  });

  return ok({
    provider: params.provider,
    valid: validation.valid,
    maskedIdentifier: validation.maskedIdentifier ?? storedCredential?.maskedValue ?? null,
    errorCategory: validation.errorCategory ?? null
  });
}

async function readOptionalJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};

  try {
    return await request.json();
  } catch {
    return {};
  }
}
