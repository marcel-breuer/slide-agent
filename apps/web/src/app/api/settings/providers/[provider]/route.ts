import { z } from "zod";

import { createDefaultProviders } from "@slide-agent/ai-providers";
import { encryptCredential } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

const ProviderCredentialSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().default(true)
});

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.");
  }

  const parsed = ProviderCredentialSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Provider credential input is invalid.");

  const params = await context.params;
  const provider = createDefaultProviders().find((candidate) => candidate.id === params.provider);
  if (!provider) return fail("PROVIDER_UNSUPPORTED", "Provider is not supported.", 404);

  const credentialValue = parsed.data.apiKey ?? parsed.data.baseUrl;
  if (!credentialValue) return fail("VALIDATION_FAILED", "Provider credential value is required.");

  const validation = await provider.validateCredential({
    ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
    ...(parsed.data.baseUrl ? { baseUrl: parsed.data.baseUrl } : {})
  });
  if (!validation.valid) {
    return fail("PROVIDER_CREDENTIAL_INVALID", "Provider credential could not be validated.", 409);
  }

  const encrypted = encryptCredential(credentialValue, process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key");
  await prisma.providerCredential.upsert({
    where: { userId_provider: { userId, provider: params.provider } },
    update: {
      enabled: parsed.data.enabled,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      metadata: encrypted.metadata
    },
    create: {
      userId,
      provider: params.provider,
      enabled: parsed.data.enabled,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      metadata: encrypted.metadata
    }
  });
  await saveProviderConfiguration(params.provider, parsed.data.baseUrl, parsed.data.enabled);

  return ok({
    provider: params.provider,
    enabled: parsed.data.enabled,
    maskedValue: encrypted.metadata.maskedValue,
    valid: true
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const params = await context.params;
  await prisma.providerCredential.updateMany({
    where: { userId, provider: params.provider },
    data: { enabled: false }
  });
  await prisma.providerConfiguration.updateMany({
    where: { provider: params.provider },
    data: { enabled: false }
  });

  return ok({ provider: params.provider, deleted: true });
}

async function saveProviderConfiguration(provider: string, baseUrl: string | undefined, enabled: boolean): Promise<void> {
  const existing = await prisma.providerConfiguration.findFirst({ where: { provider } });

  if (existing) {
    await prisma.providerConfiguration.update({
      where: { id: existing.id },
      data: {
        baseUrl: baseUrl ?? null,
        enabled
      }
    });
    return;
  }

  await prisma.providerConfiguration.create({
    data: {
      provider,
      baseUrl: baseUrl ?? null,
      enabled
    }
  });
}
