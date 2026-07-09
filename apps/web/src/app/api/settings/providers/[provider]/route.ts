import { z } from "zod";

import { createDefaultProviders } from "@slide-agent/ai-providers";
import { decryptCredential, encryptCredential } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

const ProviderCredentialSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  baseUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultModel: z.string().trim().min(1).max(160).optional(),
  enabled: z.boolean().default(true),
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

  const models = await provider.listAvailableModels({ userId });
  const defaultModel = parsed.data.defaultModel ?? models[0]?.model;
  if (!defaultModel || !models.some((model) => model.model === defaultModel)) {
    return fail("VALIDATION_FAILED", "Default model is not supported by this provider.");
  }

  const existingCredential = await prisma.providerCredential.findUnique({
    where: { userId_provider: { userId, provider: params.provider } },
  });
  const credentialValue =
    parsed.data.apiKey ??
    (params.provider === "local-openai-compatible" ? parsed.data.baseUrl : undefined);
  const storedCredentialValue =
    existingCredential && !credentialValue
      ? decryptStoredCredential(existingCredential)
      : undefined;

  if (parsed.data.enabled && !credentialValue && !storedCredentialValue) {
    return fail("VALIDATION_FAILED", "Provider credential value is required.");
  }

  const credentialInput: { apiKey?: string; baseUrl?: string } = {};
  const validationApiKey = credentialValue ?? storedCredentialValue;
  if (validationApiKey) credentialInput.apiKey = validationApiKey;
  if (parsed.data.baseUrl) credentialInput.baseUrl = parsed.data.baseUrl;

  const validation = await provider.validateCredential(credentialInput);
  if (parsed.data.enabled && !validation.valid) {
    return fail("PROVIDER_CREDENTIAL_INVALID", "Provider credential could not be validated.", 409);
  }

  const savedCredential = credentialValue
    ? await saveProviderCredential(userId, params.provider, credentialValue, parsed.data.enabled)
    : existingCredential
      ? await prisma.providerCredential.update({
          where: { userId_provider: { userId, provider: params.provider } },
          data: { enabled: parsed.data.enabled },
        })
      : null;
  await saveProviderConfiguration({
    baseUrl: parsed.data.baseUrl,
    defaultModel,
    enabled: parsed.data.enabled,
    provider: params.provider,
    userId,
  });

  return ok({
    provider: params.provider,
    enabled: parsed.data.enabled,
    maskedValue: savedCredential?.maskedValue ?? existingCredential?.maskedValue ?? null,
    defaultModel,
    valid: validation.valid,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const params = await context.params;
  await prisma.providerCredential.deleteMany({
    where: { userId, provider: params.provider },
  });
  await prisma.providerConfiguration.deleteMany({
    where: { userId, provider: params.provider },
  });

  return ok({ provider: params.provider, deleted: true });
}

async function saveProviderCredential(
  userId: string,
  provider: string,
  credentialValue: string,
  enabled: boolean,
) {
  const encrypted = encryptCredential(
    credentialValue,
    process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key",
  );

  return prisma.providerCredential.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      enabled,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      metadata: encrypted.metadata,
    },
    create: {
      userId,
      provider,
      enabled,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedValue: encrypted.metadata.maskedValue,
      metadata: encrypted.metadata,
    },
  });
}

function decryptStoredCredential(credential: {
  authTag: string;
  ciphertext: string;
  createdAt: Date;
  keyVersion: string;
  maskedValue: string;
  nonce: string;
}): string {
  return decryptCredential(
    {
      algorithm: "aes-256-gcm",
      authTag: credential.authTag,
      ciphertext: credential.ciphertext,
      keyVersion: credential.keyVersion,
      nonce: credential.nonce,
      metadata: {
        createdAt: credential.createdAt.toISOString(),
        maskedValue: credential.maskedValue,
      },
    },
    process.env.CREDENTIAL_ENCRYPTION_KEY ?? "local-dev-encryption-key",
  );
}

async function saveProviderConfiguration({
  baseUrl,
  defaultModel,
  enabled,
  provider,
  userId,
}: {
  baseUrl: string | undefined;
  defaultModel: string;
  enabled: boolean;
  provider: string;
  userId: string;
}): Promise<void> {
  await prisma.providerConfiguration.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      baseUrl: baseUrl ?? null,
      defaultModel,
      enabled,
    },
    create: {
      userId,
      provider,
      baseUrl: baseUrl ?? null,
      defaultModel,
      enabled,
    },
  });
}
