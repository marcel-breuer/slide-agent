import { createDefaultProviders } from "@slide-agent/ai-providers";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const providers = createDefaultProviders();
  const [credentials, configurations] = await Promise.all([
    prisma.providerCredential.findMany({
      where: { userId },
      select: {
        enabled: true,
        maskedValue: true,
        provider: true,
        updatedAt: true,
      },
    }),
    prisma.providerConfiguration.findMany({
      where: { userId },
      select: {
        baseUrl: true,
        defaultModel: true,
        enabled: true,
        provider: true,
      },
    }),
  ]);

  const credentialByProvider = new Map(
    credentials.map((credential) => [credential.provider, credential]),
  );
  const configurationByProvider = new Map(
    configurations.map((configuration) => [configuration.provider, configuration]),
  );

  const summaries = await Promise.all(
    providers.map(async (provider) => {
      const credential = credentialByProvider.get(provider.id);
      const configuration = configurationByProvider.get(provider.id);
      const models = await provider.listAvailableModels({ userId });
      const defaultModel = configuration?.defaultModel ?? models[0]?.model ?? null;

      return {
        provider: provider.id,
        displayName: displayNameForProvider(provider.id),
        enabled: configuration?.enabled ?? credential?.enabled ?? false,
        configured: Boolean(credential),
        maskedValue: credential?.maskedValue ?? null,
        baseUrl: configuration?.baseUrl ?? null,
        defaultModel,
        models: models.map((model) => ({
          model: model.model,
          displayLabel: model.displayLabel,
        })),
        updatedAt: credential?.updatedAt.toISOString() ?? null,
      };
    }),
  );

  return ok({ providers: summaries });
}

function displayNameForProvider(provider: string): string {
  const displayNames: Record<string, string> = {
    anthropic: "Anthropic",
    gemini: "Gemini",
    "local-openai-compatible": "Local OpenAI Compatible",
    openai: "OpenAI",
  };
  if (displayNames[provider]) return displayNames[provider];

  return provider
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
